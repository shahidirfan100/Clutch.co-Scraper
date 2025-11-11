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

        const findAgencyLinks = ($$, base) => {
            const links = new Set();
            const addFromSelector = (selector, attr) => {
                $$(selector).each((_, el) => {
                    const raw = $$(el).attr(attr);
                    if (!raw) return;
                    let candidate = raw;
                    // Handle redirect URLs
                    if (candidate.includes('r.clutch.co/redirect')) {
                        try {
                            const url = new URL(candidate);
                            const u = url.searchParams.get('u');
                            if (u) candidate = decodeURIComponent(u);
                        } catch {
                            // Ignore URL parsing errors
                        }
                    }
                    // Ensure profile URLs
                    if (!candidate.includes('/profile/')) return;
                    const abs = toAbs(candidate, base);
                    if (abs) links.add(abs);
                });
            };
            
            // Primary selectors based on actual HTML structure
            addFromSelector('a[href*="/profile/"]', 'href');
            addFromSelector('a[data-profile-url]', 'data-profile-url');
            
            // Additional fallbacks
            addFromSelector('h3 a[href*="/profile/"]', 'href');
            addFromSelector('.provider-card a[href*="/profile/"]', 'href');
            addFromSelector('.directory-listing a[href*="/profile/"]', 'href');
            
            // Also check for profile links in text content (markdown-style links)
            $$.root().find('*').each((_, el) => {
                const text = $$.text();
                const matches = text.match(/\[([^\]]+)\]\(([^)]*\/profile\/[^)]*)\)/g);
                if (matches) {
                    matches.forEach(match => {
                        const urlMatch = match.match(/\(([^)]*\/profile\/[^)]*)\)/);
                        if (urlMatch) {
                            const abs = toAbs(urlMatch[1], base);
                            if (abs) links.add(abs);
                        }
                    });
                }
            });
            
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

        const findNextPageUrl = ($$, requestUrl, pageNo) => {
            // First try to find explicit next link
            const nextLink = $$('a[href*="page="]').filter((_, el) => {
                const href = $$(el).attr('href');
                return href && (/(next|›|»)/i.test($$(el).text()) || /(page=\d+)/.test(href));
            }).first();
            
            if (nextLink.length) {
                const href = nextLink.attr('href');
                const abs = toAbs(href, requestUrl);
                if (abs) return abs;
            }
            
            // Also check for "Go to Next Page" text
            const nextText = $$('a').filter((_, el) => /(Go to Next Page|Next)/i.test($$(el).text())).first();
            if (nextText.length) {
                const href = nextText.attr('href');
                const abs = toAbs(href, requestUrl);
                if (abs) return abs;
            }
            
            // Build fallback pagination URL
            return buildNextPageFallback(requestUrl, pageNo + 1);
        };

        const buildStartUrl = (cat, loc) => {
            // Clutch.co uses /agencies for listing all agencies
            // Categories and location filters are handled via query parameters
            const baseUrl = 'https://clutch.co/agencies';
            const u = new URL(baseUrl);
            
            // Add location filter if provided
            if (loc && String(loc).trim()) {
                u.searchParams.set('location', String(loc).trim());
            }
            
            // For categories, we'll rely on the default advertising category
            // or let users specify via startUrl
            return u.href;
        };        const initial = [];
        if (Array.isArray(startUrls) && startUrls.length) initial.push(...startUrls);
        if (startUrl) initial.push(startUrl);
        if (url) initial.push(url);
        if (!initial.length) initial.push(buildStartUrl(category, location));

        const proxyConf = proxyConfiguration ? await Actor.createProxyConfiguration({ ...proxyConfiguration }) : undefined;

        let saved = 0;
        const seenDetailLinks = new Set();
        const seenBasicLinks = new Set();

        const crawler = new CheerioCrawler({
            proxyConfiguration: proxyConf,
            maxRequestRetries: 3,
            useSessionPool: true,
            sessionPoolOptions: {
                maxPoolSize: 20, // Aggressive session rotation for stealth
                sessionOptions: {
                    maxUsageCount: 5, // Rotate sessions frequently
                    maxErrorScore: 0.5,
                },
            },
            maxConcurrency: 5,
            requestHandlerTimeoutSecs: 60,
            additionalHttpRequestOptions: {
                headers: {
                    'Sec-CH-UA': '"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
                    'Sec-CH-UA-Mobile': '?0',
                    'Sec-CH-UA-Platform': '"Windows"',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Upgrade-Insecure-Requests': '1',
                },
                useHttp2: false,
                retry: {
                    limit: 3,
                    methods: ['GET'],
                    backoffLimit: 10000, // Exponential backoff up to 10s
                },
            },
            prepareRequestFunction({ request, requestOptions }) {
                requestOptions.headers = {
                    ...requestOptions.headers,
                    ...headerGenerator.getHeaders(),
                    'Accept-Language': 'en-US,en;q=0.9',
                    Referer: request.userData?.referer || 'https://clutch.co',
                    'Cache-Control': 'no-cache',
                    Pragma: 'no-cache',
                };
            },
            async requestHandler({ request, $, enqueueLinks, log: crawlerLog }) {
                const label = request.userData?.label || 'LIST';
                const pageNo = request.userData?.pageNo || 1;
                const delayMs = Math.floor(Math.random() * 600) + 300;
                await Actor.utils.sleep(delayMs);

                crawlerLog.info(`Processing ${label} page ${pageNo}: ${request.url}`);

                // Check if page loaded successfully
                if (!$ || !$('body').length) {
                    crawlerLog.error(`Failed to load page: ${request.url} - no body found`);
                    throw new Error(`Page load failed for ${request.url}`);
                }

                if (label === 'LIST') {
                    const jsonLdBlocks = extractJsonLdScripts($);
                    const jsonLdLinks = extractProfileLinksFromJsonLd(jsonLdBlocks, request.url);
                    const domLinks = findAgencyLinks($, request.url);
                    const candidateLinks = [...new Set([...jsonLdLinks, ...domLinks])];

                    crawlerLog.info(`LIST ${request.url} (page ${pageNo}) -> ${candidateLinks.length} candidates (dom ${domLinks.length}, jsonld ${jsonLdLinks.length})`);

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
                        const next = findNextPageUrl($, request.url, pageNo);
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
                        const ratingText = $('[class*="rating"]').first().text().trim() || '';
                        const ratingValue = parseNumber(organization?.aggregateRating?.ratingValue ?? ratingText.match(/(\d+(\.\d+)?)/)?.[1]);
                        const reviewCount = parseInteger(organization?.aggregateRating?.reviewCount ?? bodyText.match(/([0-9,]+)\s+reviews?/i)?.[1]);
                        const minBudgetText = organization?.priceRange ?? bodyText.match(/Min project size([^\n]+)/i)?.[1]?.trim() ?? null;
                        const hourlyText = bodyText.match(/Hourly rate([^\n]+)/i)?.[1]?.trim() ?? null;
                        const employeesText = organization?.numberOfEmployees ?? bodyText.match(/Employees([^\n]+)/i)?.[1]?.trim() ?? null;
                        const structuredAddress = formatAddress(organization?.address);
                        const locationText = structuredAddress ?? bodyText.match(/Locations?([^\n]+)/i)?.[1]?.trim() ?? null;
                        const descSection = $('h2:contains("Empowering"), h2:contains("About"), h2:contains("Overview")').first();
                        const descriptionFromDom = descSection.length ? cleanText(descSection.nextUntil('h2').html()) : null;
                        const description = organization?.description ? String(organization.description).trim() : descriptionFromDom;
                        const fallbackWebsite = $('a:contains("Visit"), a:contains("Visit website"), a:contains("website")').filter((_, el) => /visit|website/i.test($(el).text())).first().attr('href') || null;
                        const sameAsUrl = Array.isArray(organization?.sameAs)
                            ? organization.sameAs.find((value) => typeof value === 'string')
                            : typeof organization?.sameAs === 'string'
                                ? organization.sameAs
                                : null;
                        const website = organization?.url ?? sameAsUrl ?? fallbackWebsite ?? null;
                        const phoneAnchor = $('a[href^="tel:"]').first().attr('href');
                        const emailAnchor = $('a[href^="mailto:"]').first().attr('href');
                        const phone = organization?.telephone ?? (phoneAnchor ? phoneAnchor.replace(/^tel:/, '').trim() : null);
                        const email = organization?.email ?? (emailAnchor ? emailAnchor.replace(/^mailto:/, '').trim() : null);
                        const services = extractServicesFromPage($);
                        const industries = extractIndustriesFromPage($);
                        const awards = extractAwards($);
                        const testimonials = extractTestimonials($);
                        const name = organization?.name ?? $('h1').first().text().trim() ?? null;
                        if (!name) {
                            crawlerLog.warning(`No agency name found on ${request.url}, skipping`);
                            return;
                        }

                        const item = {
                            name,
                            rating: ratingValue,
                            review_count: reviewCount,
                            verified: $('[class*="verified"]').first().text().trim() || null,
                            min_budget: minBudgetText,
                            hourly_rate: hourlyText,
                            company_size: employeesText,
                            location: locationText,
                            services,
                            industries,
                            awards,
                            testimonials,
                            description: description || null,
                            website,
                            phone,
                            email,
                            url: request.url,
                            address: structuredAddress ?? null,
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

        try {
            await crawler.run(initial.map(u => ({ url: u, userData: { label: 'LIST', pageNo: 1, referer: 'https://clutch.co' } })));
            log.info(`Finished scraping. Total saved: ${saved} agencies`);
        } catch (err) {
            log.error(`Crawler failed: ${err.message}`);
            throw err;
        }
    } finally {
        await Actor.exit();
    }
}

main().catch(err => { console.error(err); process.exit(1); });
