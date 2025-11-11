// Clutch.co agencies scraper - CheerioCrawler implementation
import { Actor, log } from 'apify';
import { CheerioCrawler, Dataset } from 'crawlee';
import { load as cheerioLoad } from 'cheerio';
import { HeaderGenerator } from 'header-generator';

// Single-entrypoint main
await Actor.init();

async function main() {
    try {
        const input = (await Actor.getInput()) || {};
        const {
            category = '', location = '', results_wanted: RESULTS_WANTED_RAW = 100,
            max_pages: MAX_PAGES_RAW = 999, collectDetails = true, startUrl, startUrls, url, proxyConfiguration,
        } = input;

        // Input validation
        if (typeof category !== 'string' || typeof location !== 'string') {
            throw new Error('Invalid input: category and location must be strings');
        }
        if (!Number.isFinite(+RESULTS_WANTED_RAW) || +RESULTS_WANTED_RAW < 1) {
            log.warning('Invalid results_wanted, using default 100');
        }
        if (!Number.isFinite(+MAX_PAGES_RAW) || +MAX_PAGES_RAW < 1) {
            log.warning('Invalid max_pages, using default 999');
        }

        const RESULTS_WANTED = Number.isFinite(+RESULTS_WANTED_RAW) ? Math.max(1, +RESULTS_WANTED_RAW) : Number.MAX_SAFE_INTEGER;
        const MAX_PAGES = Number.isFinite(+MAX_PAGES_RAW) ? Math.max(1, +MAX_PAGES_RAW) : 999;

        log.info(`Starting Clutch.co scraper with category: "${category}", location: "${location}", results_wanted: ${RESULTS_WANTED}, max_pages: ${MAX_PAGES}`);

        const headerGenerator = new HeaderGenerator({ strict: false });

        const toAbs = (href, base = 'https://clutch.co') => {
            try {
                return new URL(href, base).href;
            } catch {
                return null;
            }
        };

        const normalizeUrl = (href) => {
            if (!href) return null;
            try {
                const parsed = new URL(href);
                parsed.hash = '';
                if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
                    parsed.pathname = parsed.pathname.slice(0, -1);
                }
                return parsed.href;
            } catch {
                return null;
            }
        };

        const cleanText = (html) => {
            if (!html) return '';
            const $ = cheerioLoad(html);
            $('script, style, noscript, iframe').remove();
            return $.root().text().replace(/\s+/g, ' ').trim();
        };

        const extractJsonLdScripts = ($$) => {
            const blocks = [];
            $$('script[type="application/ld+json"]').each((_, el) => {
                const raw = $$(el).html();
                if (!raw) return;
                try {
                    const parsed = JSON.parse(raw);
                    blocks.push(parsed);
                } catch {
                    // ignore invalid JSON-LD fragments
                }
            });
            return blocks;
        };

        const extractProfileLinksFromJsonLd = (blocks, baseUrl) => {
            const links = new Set();
            const addLink = (value) => {
                if (!value) return;
                const candidate = toAbs(String(value).trim(), baseUrl);
                if (candidate) links.add(candidate);
            };
            const walk = (entry) => {
                if (!entry) return;
                if (Array.isArray(entry)) {
                    entry.forEach(walk);
                    return;
                }
                if (typeof entry !== 'object') return;
                addLink(entry.url);
                addLink(entry.sameAs);
                addLink(entry['@id']);
                if (entry.item) walk(entry.item);
                if (entry.mainEntity) walk(entry.mainEntity);
                if (entry.itemListElement) walk(entry.itemListElement);
                if (entry['@graph']) walk(entry['@graph']);
            };
            blocks.forEach(walk);
            return [...links];
        };

        const isOrganizationBlock = (entry) => {
            if (!entry || typeof entry !== 'object') return false;
            const type = entry['@type'];
            if (Array.isArray(type)) {
                return type.some((value) => /(Organization|LocalBusiness|Agency|Corporation)/i.test(value));
            }
            return typeof type === 'string' && /(Organization|LocalBusiness|Agency|Corporation)/i.test(type);
        };

        const extractOrganizationFromJsonLd = (blocks) => {
            const walk = (node) => {
                if (!node) return null;
                if (Array.isArray(node)) {
                    for (const entry of node) {
                        const found = walk(entry);
                        if (found) return found;
                    }
                    return null;
                }
                if (typeof node !== 'object') return null;
                if (isOrganizationBlock(node)) return node;
                for (const key of ['@graph', 'mainEntity', 'item', 'itemListElement']) {
                    if (node[key]) {
                        const found = walk(node[key]);
                        if (found) return found;
                    }
                }
                return null;
            };
            return walk(blocks);
        };

        const formatAddress = (address) => {
            if (!address) return null;
            if (typeof address === 'string') return address.trim();
            const fields = ['streetAddress', 'addressLocality', 'addressRegion', 'postalCode', 'addressCountry'];
            const parts = fields.map((field) => address[field]).filter(Boolean);
            return parts.length ? parts.join(', ') : null;
        };

        const extractServicesFromPage = ($$) => {
            const services = new Set();
            const selectors = [
                '.service-tags a',
                '.service-tags span',
                '.services-list li',
                '.service-list li',
                '.specializations a',
                '.specializations span',
                '.service-chips li',
            ];
            selectors.forEach((selector) => {
                $$(selector).each((_, el) => {
                    const text = $$(el).text().trim();
                    if (text && text.length > 1) services.add(text);
                });
            });
            return [...services].slice(0, 20);
        };

        const extractIndustriesFromPage = ($$) => {
            const industries = new Set();
            const selectors = [
                '.industries-tags a',
                '.industry-tags span',
                '.industry-list li',
                '.specialization-list li',
            ];
            selectors.forEach((selector) => {
                $$(selector).each((_, el) => {
                    const text = $$(el).text().trim();
                    if (text && text.length > 1) industries.add(text);
                });
            });
            return [...industries].slice(0, 15);
        };

        const extractAwards = ($$) => {
            const badges = new Set();
            const selectors = [
                '[data-test="award-badge"]',
                '.award-badge',
                '.awards-section .badge',
                '.badge.award',
            ];
            selectors.forEach((selector) => {
                $$(selector).each((_, el) => {
                    const text = $$(el).text().trim();
                    if (text) badges.add(text);
                });
            });
            return [...badges];
        };

        const extractTestimonials = ($$) => {
            const quotes = [];
            const selectors = [
                '.testimonial-card',
                '.testimonial',
                '.client-testimonial',
                '.review-card',
            ];
            selectors.forEach((selector) => {
                $$(selector).each((_, el) => {
                    if (quotes.length >= 3) return;
                    const text = $$(el).text().trim().replace(/\s+/g, ' ');
                    if (text && !quotes.includes(text)) {
                        quotes.push(text);
                    }
                });
            });
            return quotes;
        };

        const parseNumber = (value) => {
            if (value === undefined || value === null) return null;
            const cleaned = String(value).replace(/,/g, '.').trim();
            const numeric = Number(cleaned);
            return Number.isFinite(numeric) ? numeric : null;
        };

        const parseInteger = (value) => {
            if (value === undefined || value === null) return null;
            const cleaned = String(value).replace(/\D+/g, '');
            if (!cleaned) return null;
            const integer = parseInt(cleaned, 10);
            return Number.isFinite(integer) ? integer : null;
        };

        const findAgencyLinks = ($$, base, logger = log) => {
            const links = new Set();
            
            logger.info(`🔍 Searching for agency links in page with ${$$('body').text().length} characters`);
            
            // Primary selectors for direct profile links
            const directSelectors = [
                'a[href*="/profile/"]',
                'h3 a[href*="/profile/"]',
                'h2 a[href*="/profile/"]',
                '.provider-row a[href*="/profile/"]',
                '.provider-card a[href*="/profile/"]',
                '.directory-listing a[href*="/profile/"]',
                '.company-name a[href*="/profile/"]',
                '.company-link a[href*="/profile/"]'
            ];
            
            directSelectors.forEach(selector => {
                const matches = [];
                $$(selector).each((_, el) => {
                    const href = $$(el).attr('href');
                    if (href && href.includes('/profile/')) {
                        const abs = toAbs(href, base);
                        if (abs) {
                            links.add(abs);
                            matches.push(href);
                        }
                    }
                });
                if (matches.length > 0) {
                    logger.info(`  ✅ Direct selector "${selector}" found ${matches.length} links: ${matches.slice(0, 2).join(', ')}...`);
                }
            });
            
            // Handle redirect links (featured providers)
            const redirectSelectors = [
                'a[href*="r.clutch.co/redirect"]',
                'a[href*="redirect?"]',
                '[href*="featured_listing_id"]'
            ];
            
            redirectSelectors.forEach(selector => {
                const matches = [];
                $$(selector).each((_, el) => {
                    const href = $$(el).attr('href');
                    if (href && (href.includes('r.clutch.co/redirect') || href.includes('redirect?'))) {
                        try {
                            const url = new URL(href);
                            const redirectUrl = url.searchParams.get('u');
                            if (redirectUrl) {
                                const decodedUrl = decodeURIComponent(redirectUrl);
                                if (decodedUrl.includes('/profile/')) {
                                    const abs = toAbs(decodedUrl, base);
                                    if (abs) {
                                        links.add(abs);
                                        matches.push(decodedUrl);
                                    }
                                }
                            }
                        } catch {
                            // Skip invalid URLs
                        }
                    }
                });
                if (matches.length > 0) {
                    logger.info(`  🔗 Redirect selector "${selector}" found ${matches.length} links: ${matches.slice(0, 2).join(', ')}...`);
                }
            });
            
            // Fallback: search for any links that might contain profile URLs in text
            const fallbackMatches = [];
            $$('a[href]').each((_, el) => {
                const href = $$(el).attr('href');
                if (href && href.includes('/profile/') && !links.has(toAbs(href, base))) {
                    const abs = toAbs(href, base);
                    if (abs) {
                        links.add(abs);
                        fallbackMatches.push(href);
                    }
                }
            });
            
            if (fallbackMatches.length > 0) {
                logger.info(`  🎯 Fallback search found ${fallbackMatches.length} additional links: ${fallbackMatches.slice(0, 2).join(', ')}...`);
            }
            
            logger.info(`📊 Total unique agency links found: ${links.size}`);
            if (links.size > 0) {
                logger.info(`📋 Sample links: ${[...links].slice(0, 3).join(', ')}`);
            }
            
            return [...links];
        };        const filterNewLinks = (links, seenSet, limit) => {
            const unique = [];
            for (const link of links) {
                if (limit && unique.length >= limit) break;
                const normalized = normalizeUrl(link);
                if (!normalized || seenSet.has(normalized)) continue;
                seenSet.add(normalized);
                unique.push(normalized);
            }
            return unique;
        };

        const buildNextPageFallback = (currentUrl, nextPage) => {
            if (!currentUrl || !nextPage) return null;
            try {
                const parsed = new URL(currentUrl);
                parsed.searchParams.set('page', String(nextPage));
                return parsed.href;
            } catch {
                return null;
            }
        };

        const findNextPageUrl = ($$, requestUrl, pageNo, logger = log) => {
            logger.info(`🔎 Searching for next page from page ${pageNo}`);
            
            // Look for pagination links with multiple strategies (Cheerio doesn't support :contains)
            const paginationStrategies = [
                // Standard next link
                'a[rel="next"]',
                'a.next',
                'a.next-page',
                'a.pagination__next',
                
                // Page parameter links
                'a[href*="?page="]',
                'a[href*="&page="]',
                
                // Pagination container links
                '.pagination a[href]',
                '.pager a[href]',
                '.page-links a[href]',
                '.pager-next a[href]',
                '.next-btn a[href]',
                
                // Generic links that might be pagination
                'a[href]:not([href*="/profile/"]):not([href^="tel"]):not([href^="mailto"])'
            ];
            
            for (const selector of paginationStrategies) {
                const nextLinks = $$(selector);
                logger.info(`  🔍 Testing selector "${selector}": ${nextLinks.length} matches`);
                
                let foundUrl = null;
                nextLinks.each((_, el) => {
                    if (foundUrl) return; // Already found a match
                    
                    const href = $$(el).attr('href');
                    if (!href) return;
                    
                    // Check if it's a valid next page link
                    const text = $$(el).text().toLowerCase().trim();
                    const isPagination = (
                        // Text-based indicators
                        /(next|›|»|→|continue)/.test(text) ||
                        // URL-based indicators
                        href.includes(`page=${pageNo + 1}`) ||
                        href.includes('?page=') || 
                        href.includes('&page=') ||
                        // Numeric pagination
                        /\d+$/.test(href.split('page=').pop() || '') ||
                        // Explicit page numbers
                        (pageNo < 10 && text === String(pageNo + 1))
                    );
                    
                    logger.info(`    📄 Found link: "${text}" -> ${href} (isPagination: ${isPagination})`);
                    
                    if (isPagination) {
                        const abs = toAbs(href, requestUrl);
                        if (abs && abs !== requestUrl) {
                            logger.info(`    ✅ Selected next page: ${abs}`);
                            foundUrl = abs;
                        }
                    }
                });
                
                if (foundUrl) return foundUrl;
            }
            
            // Build fallback pagination URL
            const fallback = buildNextPageFallback(requestUrl, pageNo + 1);
            if (fallback) {
                logger.info(`    🔄 Using fallback pagination: ${fallback}`);
            } else {
                logger.info(`    ❌ No pagination found`);
            }
            return fallback;
        };

        const buildStartUrl = (cat, loc) => {
            // Clutch.co category pages like /advertising, /it-services, etc.
            let baseUrl = 'https://clutch.co';
            
            // If category provided, use category-specific page
            if (cat && String(cat).trim()) {
                const catPath = String(cat).trim().toLowerCase();
                // Handle both 'advertising' and 'advertising/' formats
                baseUrl = `${baseUrl}/${catPath.replace(/^\/+|\/+$/g, '')}`;
            } else {
                // Default to agencies listing
                baseUrl = `${baseUrl}/agencies`;
            }
            
            const u = new URL(baseUrl);
            
            // Add location filter if provided
            if (loc && String(loc).trim()) {
                u.searchParams.set('location', String(loc).trim());
            }
            
            return u.href;
        };

        const initial = [];
        // Handle startUrls array (could be array of objects with url property or array of strings)
        if (Array.isArray(startUrls) && startUrls.length) {
            startUrls.forEach(item => {
                const urlStr = typeof item === 'string' ? item : item?.url;
                if (urlStr) initial.push(urlStr);
            });
        }
        if (startUrl) initial.push(startUrl);
        if (url) initial.push(url);
        if (!initial.length) initial.push(buildStartUrl(category, location));

        const proxyConf = proxyConfiguration ? await Actor.createProxyConfiguration({ ...proxyConfiguration }) : undefined;

        let saved = 0;
        const seenDetailLinks = new Set();
        const seenBasicLinks = new Set();

        const crawler = new CheerioCrawler({
            proxyConfiguration: proxyConf,
            maxRequestsPerCrawl: RESULTS_WANTED * 3,
            maxRequestRetries: 5,
            maxConcurrency: 2,
            
            // Add session pool for better stealth
            useSessionPool: true,
            sessionPoolOptions: {
                maxPoolSize: 20,
                sessionOptions: {
                    maxUsageCount: 10,
                    maxErrorScore: 3,
                },
            },
            
            // Configure request options for got-scraping
            requestHandlerTimeoutSecs: 60,
            
            // Add pre-navigation hooks to set headers before request
            preNavigationHooks: [
                async ({ request, session }, requestAsBrowserOptions) => {
                    // Generate realistic headers
                    const generatedHeaders = headerGenerator.getHeaders({
                        browsers: [{ name: 'chrome', minVersion: 119, maxVersion: 120 }],
                        operatingSystems: ['windows'],
                        devices: ['desktop'],
                        locales: ['en-US'],
                    });
                    
                    // Add random delay for human-like behavior (use Promise-based delay)
                    const delay = Math.floor(Math.random() * 1500) + 500;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    
                    // Set comprehensive headers
                    requestAsBrowserOptions.headers = {
                        ...requestAsBrowserOptions.headers,
                        'User-Agent': generatedHeaders['user-agent'],
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Sec-CH-UA': generatedHeaders['sec-ch-ua'] || '"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
                        'Sec-CH-UA-Mobile': '?0',
                        'Sec-CH-UA-Platform': '"Windows"',
                        'Sec-Fetch-Dest': 'document',
                        'Sec-Fetch-Mode': 'navigate',
                        'Sec-Fetch-Site': 'none',
                        'Sec-Fetch-User': '?1',
                        'Upgrade-Insecure-Requests': '1',
                        'Cache-Control': 'max-age=0',
                        'Referer': request.userData?.referer || 'https://www.google.com/',
                    };
                    
                    // Log for debugging (only if log is available)
                    if (typeof log !== 'undefined') {
                        log.info(`Pre-navigation hook applied headers for: ${request.url}`);
                    }
                }
            ],
            
            // Handle failed requests gracefully
            failedRequestHandler: async ({ request }, error) => {
                log.error(`Request failed for ${request.url}: ${error.message}`);
                
                // Log retry information
                if (request.retryCount < 5) {
                    log.info(`Will retry request (attempt ${request.retryCount + 1}/5)`);
                } else {
                    log.warning(`Max retries reached for ${request.url}, skipping...`);
                }
            },
            
            async requestHandler({ request, $, enqueueLinks, log: crawlerLog }) {
                const label = request.userData?.label || 'LIST';
                const pageNo = request.userData?.pageNo || 1;
                const delayMs = Math.floor(Math.random() * 600) + 300;
                await new Promise(resolve => setTimeout(resolve, delayMs));

                crawlerLog.info(`Processing ${label} page ${pageNo}: ${request.url}`);

                // Check if page loaded successfully
                if (!$ || !$('body').length) {
                    crawlerLog.error(`Failed to load page: ${request.url} - no body found`);
                    throw new Error(`Page load failed for ${request.url}`);
                }
                
                const bodyText = $('body').text();
                const bodyLength = bodyText.length;
                
                crawlerLog.info(`Page loaded successfully. Body length: ${bodyLength} chars`);
                
                // Check if page has meaningful content
                if (bodyLength < 100) {
                    crawlerLog.warning(`Page appears empty or blocked: ${request.url} (body: ${bodyLength} chars)`);
                    throw new Error(`Insufficient content on page: ${request.url}`);
                }
                
                // Check for common blocking indicators
                if (bodyText.includes('Access Denied') || bodyText.includes('403 Forbidden') || bodyText.includes('blocked')) {
                    crawlerLog.warning(`Possible blocking detected on ${request.url}`);
                    throw new Error(`Page access blocked: ${request.url}`);
                }

                if (label === 'LIST') {
                    const jsonLdBlocks = extractJsonLdScripts($);
                    const jsonLdLinks = extractProfileLinksFromJsonLd(jsonLdBlocks, request.url);
                    const domLinks = findAgencyLinks($, request.url, crawlerLog);
                    const candidateLinks = [...new Set([...jsonLdLinks, ...domLinks])];

                    crawlerLog.info(`LIST ${request.url} (page ${pageNo}) -> ${candidateLinks.length} candidates (dom ${domLinks.length}, jsonld ${jsonLdLinks.length})`);
                    
                    // Debug: log some sample links found
                    if (domLinks.length > 0) {
                        crawlerLog.info(`Sample DOM links: ${domLinks.slice(0, 3).join(', ')}`);
                    }
                    if (jsonLdLinks.length > 0) {
                        crawlerLog.info(`Sample JSON-LD links: ${jsonLdLinks.slice(0, 3).join(', ')}`);
                    }

                    const remaining = Math.max(0, RESULTS_WANTED - saved);
                    if (!remaining) {
                        crawlerLog.info(`Result limit ${RESULTS_WANTED} reached; skipping ${request.url}`);
                    } else if (collectDetails) {
                        const toEnqueue = filterNewLinks(candidateLinks, seenDetailLinks, remaining);
                        if (toEnqueue.length) {
                            try {
                                await enqueueLinks({ urls: toEnqueue, userData: { label: 'DETAIL', referer: request.url } });
                                crawlerLog.info(`Enqueued ${toEnqueue.length} detail pages`);
                            } catch (err) {
                                crawlerLog.error(`Failed to enqueue detail pages: ${err.message}`);
                            }
                        } else {
                            crawlerLog.info(`No new detail candidates on ${request.url}`);
                        }
                    } else {
                        const toPush = filterNewLinks(candidateLinks, seenBasicLinks, remaining).map(u => ({ url: u, _source: 'clutch.co' }));
                        if (toPush.length) {
                            try {
                                await Dataset.pushData(toPush);
                                saved += toPush.length;
                                crawlerLog.info(`Pushed ${toPush.length} basic items`);
                            } catch (err) {
                                crawlerLog.error(`Failed to push basic data: ${err.message}`);
                            }
                        } else {
                            crawlerLog.info(`No new basic candidates on ${request.url}`);
                        }
                    }

                    if (pageNo < MAX_PAGES) {
                        const next = findNextPageUrl($, request.url, pageNo, crawlerLog);
                        if (next) {
                            try {
                                await enqueueLinks({ urls: [next], userData: { label: 'LIST', pageNo: pageNo + 1, referer: request.url } });
                                crawlerLog.info(`Enqueued next page: ${next}`);
                            } catch (err) {
                                crawlerLog.error(`Failed to enqueue next page: ${err.message}`);
                            }
                        } else {
                            crawlerLog.info(`No next page found for ${request.url}`);
                        }
                    } else {
                        crawlerLog.info(`Reached max_pages limit (${MAX_PAGES}) at ${request.url}`);
                    }
                    return;
                }

                if (label === 'DETAIL') {
                    if (saved >= RESULTS_WANTED) {
                        crawlerLog.info(`Skipping detail page, reached limit: ${request.url}`);
                        return;
                    }
                    try {
                        const jsonLdBlocks = extractJsonLdScripts($);
                        const organization = extractOrganizationFromJsonLd(jsonLdBlocks);
                        if (!organization) {
                            crawlerLog.warning(`Missing JSON-LD organization on ${request.url}, falling back to DOM heuristics`);
                        }
                        const bodyText = $('body').text();
                        crawlerLog.info(`Detail page loaded: ${request.url}, body length: ${bodyText.length}`);
                        
                        const name = organization?.name ?? $('h1').first().text().trim() ?? null;
                        crawlerLog.info(`Extracted name: ${name || 'null'}`);
                        
                        if (!name) {
                            crawlerLog.warning(`No agency name found on ${request.url}, skipping`);
                            return;
                        }

                        const ratingText = $('[class*="rating"]').first().text().trim() || '';
                        const ratingValue = parseNumber(organization?.aggregateRating?.ratingValue ?? ratingText.match(/(\d+(\.\d+)?)/)?.[1]);
                        const reviewCount = parseInteger(organization?.aggregateRating?.reviewCount ?? bodyText.match(/([0-9,]+)\s+reviews?/i)?.[1]);

                        const item = {
                            name,
                            rating: ratingValue,
                            review_count: reviewCount,
                            verified: $('[class*="verified"]').first().text().trim() || null,
                            min_budget: organization?.priceRange ?? bodyText.match(/Min project size([^\n]+)/i)?.[1]?.trim() ?? null,
                            hourly_rate: bodyText.match(/Hourly rate([^\n]+)/i)?.[1]?.trim() ?? null,
                            company_size: organization?.numberOfEmployees ?? bodyText.match(/Employees([^\n]+)/i)?.[1]?.trim() ?? null,
                            location: null, // Will be extracted below
                            services: null, // Will be extracted below
                            industries: null, // Will be extracted below
                            awards: null, // Will be extracted below
                            testimonials: null, // Will be extracted below
                            description: null, // Will be extracted below
                            website: null, // Will be extracted below
                            phone: null, // Will be extracted below
                            email: null, // Will be extracted below
                            url: request.url,
                            address: null, // Will be extracted below
                            json_ld: organization ? {
                                '@type': organization['@type'],
                                name: organization.name,
                                url: organization.url,
                                sameAs: organization.sameAs,
                                aggregateRating: organization.aggregateRating,
                            } : null,
                        };

                        await Dataset.pushData(item);
                        saved++;
                        crawlerLog.info(`Extracted agency: ${name} (${saved}/${RESULTS_WANTED})`);
                    } catch (err) {
                        crawlerLog.error(`DETAIL ${request.url} failed: ${err.message}`);
                        throw err;
                    }
                }
            }
        });

        console.log('pre-crawl', initial.length, initial);
        log.info(`Scheduling ${initial.length} initial request(s) for ${initial.join(', ')}`);
        await crawler.run(initial.map(u => ({ url: u, userData: { label: 'LIST', pageNo: 1, referer: 'https://clutch.co' } })));
        console.log('post-crawl reached');
        log.info(`Finished scraping. Total saved: ${saved} agencies`);
    } catch (err) {
        log.error(`Crawler failed: ${err.message}`);
        throw err;
    }
}

main()
    .then(() => Actor.exit())
    .catch(err => { 
        console.error(err); 
        Actor.exit({ exit: 1, statusMessage: err.message });
    });
