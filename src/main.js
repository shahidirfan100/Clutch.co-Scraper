import { Actor, log } from 'apify';
import { CheerioCrawler, Dataset } from 'crawlee';
import { load as cheerioLoad } from 'cheerio';
import { HeaderGenerator } from 'header-generator';

await Actor.init();

const BASE_URL = 'https://clutch.co';

const headerGenerator = new HeaderGenerator({
    browsers: [
        { name: 'chrome', minVersion: 118, maxVersion: 127 },
        { name: 'edge', minVersion: 118, maxVersion: 126 },
    ],
    devices: ['desktop', 'mobile'],
    operatingSystems: ['windows', 'macos'],
    locales: ['en-US', 'en-GB'],
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const nowIso = () => new Date().toISOString();

const toAbs = (href, base = BASE_URL) => {
    if (!href) return null;
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
            // Ignore invalid JSON-LD fragments
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

const extractServicesFromPage = ($$) => {
    const services = new Set();
    const selectors = [
        '.service-tags a',
        '.service-tags span',
        '.services-list li',
        '.specializations a',
        '.specializations span',
        '.service-chips li',
        '[data-test="service"]',
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
        '.industry-tags a',
        '.industry-tags span',
        '.industry-list li',
        '.specialization-list li',
        '[data-test="industry"]',
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
    const awards = new Set();
    const selectors = [
        '[data-test="award-badge"]',
        '.award-badge',
        '.awards-section .badge',
        '.badge.award',
        '.recognition-list li',
    ];
    selectors.forEach((selector) => {
        $$(selector).each((_, el) => {
            const text = $$(el).text().trim();
            if (text) awards.add(text);
        });
    });
    return [...awards];
};

const extractTestimonials = ($$) => {
    const quotes = [];
    const selectors = [
        '.testimonial-card',
        '.testimonial',
        '.client-testimonial',
        '.review-card',
        '[data-test="testimonial-card"]',
    ];
    selectors.forEach((selector) => {
        $$(selector).each((_, el) => {
            if (quotes.length >= 3) return;
            const text = $$(el).text().trim().replace(/\s+/g, ' ');
            if (text && !quotes.includes(text)) quotes.push(text);
        });
    });
    return quotes;
};

const extractLocationsFromPage = ($$) => {
    const locations = new Set();
    const selectors = [
        '[data-test="location"]',
        '.location',
        '.locality',
        '.quick-stats__location',
        '.profile-summary__location',
        '.office-locations li',
    ];
    selectors.forEach((selector) => {
        $$(selector).each((_, el) => {
            const text = $$(el).text().trim().replace(/\s+/g, ' ');
            if (text) locations.add(text);
        });
    });
    return [...locations].slice(0, 10);
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

const formatAddress = (address) => {
    if (!address) return null;
    if (typeof address === 'string') return address.trim();
    const fields = ['streetAddress', 'addressLocality', 'addressRegion', 'postalCode', 'addressCountry'];
    const parts = fields.map((field) => address[field]).filter(Boolean);
    return parts.length ? parts.join(', ') : null;
};

const collectContactInfo = ($$) => {
    const websiteFromText = () => {
        let link = null;
        $$('a[href]').each((_, el) => {
            if (link) return;
            const text = $$(el).text().trim().toLowerCase();
            if (/website/.test(text)) link = $$(el).attr('href');
        });
        if (!link) link = $$('a[href^="http"]').first().attr('href');
        return link ? toAbs(link) || link : null;
    };

    const phoneLink = $$('a[href^="tel:"]').first().attr('href');
    const phoneText = phoneLink ? phoneLink.replace(/tel:/i, '') : $$('[data-test="phone"]').first().text();
    const emailLink = $$('a[href^="mailto:"]').first().attr('href');

    return {
        website: websiteFromText(),
        phone: phoneText ? phoneText.trim() : null,
        email: emailLink ? emailLink.replace(/mailto:/i, '').trim() : null,
    };
};

const filterNewLinks = (links, seenSet, limit = Infinity) => {
    if (!links?.length || !limit) return [];
    const unique = [];
    for (const link of links) {
        if (unique.length >= limit) break;
        const normalized = normalizeUrl(link);
        if (!normalized || seenSet.has(normalized)) continue;
        seenSet.add(normalized);
        unique.push(normalized);
    }
    return unique;
};

const findAgencyLinks = ($$, base) => {
    const links = new Set();
    const selectors = [
        'a[href*="/profile/"]',
        'h3 a[href*="/profile/"]',
        '.provider-row a[href*="/profile/"]',
        '.provider-card a[href*="/profile/"]',
        '.company-name a[href*="/profile/"]',
        '.directory-listing a[href*="/profile/"]',
    ];
    selectors.forEach((selector) => {
        $$(selector).each((_, el) => {
            const href = $$(el).attr('href');
            if (!href || !href.includes('/profile/')) return;
            const abs = toAbs(href, base);
            if (abs) links.add(abs);
        });
    });
    return [...links];
};

const buildNextPageUrl = ($$, currentUrl, currentPage = 1) => {
    const selectors = [
        'a[rel="next"]',
        '.pager-next a[href]',
        '.pagination a[href]',
        'a.next',
        'a[href*="?page="]',
        'a[href*="&page="]',
    ];
    let candidate = null;
    selectors.every((selector) => {
        $$(selector).each((_, el) => {
            if (candidate) return;
            const href = $$(el).attr('href');
            if (!href) return;
            const text = $$(el).text().trim().toLowerCase();
            const looksLikeNext = /(next|more)/.test(text)
                || href.includes(`page=${currentPage + 1}`)
                || href.includes('?page=');
            if (looksLikeNext) candidate = href;
        });
        return !candidate;
    });
    if (!candidate) {
        try {
            const parsed = new URL(currentUrl);
            parsed.searchParams.set('page', String(currentPage + 1));
            candidate = parsed.href;
        } catch {
            return null;
        }
    }
    const absolute = toAbs(candidate, currentUrl);
    return absolute && absolute !== currentUrl ? absolute : null;
};

const buildStartUrls = ({ startUrls, startUrl, url, category, location }) => {
    const urls = [];
    if (Array.isArray(startUrls)) {
        for (const entry of startUrls) {
            const href = typeof entry === 'string' ? entry : entry?.url;
            if (href) urls.push(href);
        }
    }
    if (startUrl) urls.push(startUrl);
    if (url) urls.push(url);
    if (!urls.length) {
        const slug = category ? `/${String(category).trim().replace(/^\/+|\/+$/g, '')}` : '/agencies';
        const built = new URL(`${BASE_URL}${slug}`);
        if (location) built.searchParams.set('location', String(location).trim());
        urls.push(built.href);
    }
    const normalized = urls
        .map((href) => normalizeUrl(toAbs(href)))
        .filter(Boolean);
    return [...new Set(normalized)];
};

const buildProxyConfiguration = async (proxyConfiguration) => {
    const config = proxyConfiguration && Object.keys(proxyConfiguration).length
        ? proxyConfiguration
        : { useApifyProxy: true, groups: ['RESIDENTIAL'] };
    try {
        const proxy = await Actor.createProxyConfiguration(config);
        if (!proxy) {
            log.warning('Proxy configuration not created; Clutch is likely to block direct traffic.');
        }
        return proxy;
    } catch (err) {
        log.warning(`Unable to use proxy configuration (${err.message}). Continuing without proxy.`);
        return undefined;
    }
};

const createListRequest = (url, pageNo = 1, referer = BASE_URL) => ({
    url,
    userData: { label: 'LIST', pageNo, referer },
});

const extractDetailItem = ($, organization, request, meta) => {
    const bodyText = cleanText($.html());
    const name = organization?.name
        ?? $('[data-test="profile-name"]').first().text().trim()
        ?? $('h1').first().text().trim()
        ?? null;
    if (!name) return null;

    const ratingText = $('[class*="rating"]').first().text().trim();
    const ratingValue = parseNumber(organization?.aggregateRating?.ratingValue ?? ratingText.match(/(\d+(\.\d+)?)/)?.[1]);
    const reviewText = $('[data-test="review-count"]').first().text().trim() || bodyText.match(/([0-9,]+)\s+reviews?/i)?.[1];
    const reviewCount = parseInteger(organization?.aggregateRating?.reviewCount ?? reviewText);
    const contacts = collectContactInfo($);
    const services = extractServicesFromPage($);
    const industries = extractIndustriesFromPage($);
    const awards = extractAwards($);
    const testimonials = extractTestimonials($);
    const locations = extractLocationsFromPage($);

    const description = $('[data-test="about-text"]').text().trim()
        || $('#about').text().trim()
        || bodyText.slice(0, 600);

    const minBudget = $('[data-test="minimum-project-size"]').text().trim()
        || organization?.priceRange
        || bodyText.match(/Min(?:imum)? project size:?([^$]+)/i)?.[1]?.trim()
        || null;

    const hourlyRate = $('[data-test="avg-hourly-rate"]').text().trim()
        || bodyText.match(/Hourly rate:?([^\n]+)/i)?.[1]?.trim()
        || null;

    const companySize = $('[data-test="employees"]').text().trim()
        || organization?.numberOfEmployees
        || bodyText.match(/Employees:?([^\n]+)/i)?.[1]?.trim()
        || null;

    return {
        name,
        url: request.url,
        slug: request.url.split('/profile/').pop() || null,
        rating: ratingValue,
        review_count: reviewCount,
        verified: $('[class*="verified"]').first().text().trim() || null,
        min_budget: minBudget,
        hourly_rate: hourlyRate,
        company_size: companySize,
        primary_location: organization?.address?.addressLocality || locations[0] || null,
        locations: locations.length ? locations : null,
        services: services.length ? services : null,
        industries: industries.length ? industries : null,
        awards: awards.length ? awards : null,
        testimonials: testimonials.length ? testimonials : null,
        description: description || null,
        website: contacts.website || organization?.url || null,
        phone: contacts.phone || organization?.telephone || null,
        email: contacts.email || null,
        address: formatAddress(organization?.address),
        json_ld: organization || null,
        category_filter: meta.category || null,
        location_filter: meta.location || null,
        fetched_at: nowIso(),
        meta: {
            referer: meta.referer || null,
            detail_body_length: bodyText.length,
        },
    };
};

async function main() {
    const input = (await Actor.getInput()) || {};
    const {
        category = '',
        location = '',
        results_wanted: RESULTS_WANTED_RAW = 100,
        max_pages: MAX_PAGES_RAW = 25,
        collectDetails = true,
        startUrls,
        startUrl,
        url,
        proxyConfiguration,
        maxConcurrency: MAX_CONCURRENCY_RAW = 4,
        requestHandlerTimeoutSecs: REQUEST_TIMEOUT_RAW = 60,
        debugLog = false,
    } = input;

    if (typeof category !== 'string' || typeof location !== 'string') {
        throw new Error('Invalid input: category and location must be strings');
    }

    if (debugLog) log.setLevel(log.LEVELS.DEBUG);

    const RESULTS_WANTED = Number.isFinite(+RESULTS_WANTED_RAW) ? Math.max(1, +RESULTS_WANTED_RAW) : Number.MAX_SAFE_INTEGER;
    const MAX_PAGES = Number.isFinite(+MAX_PAGES_RAW) ? Math.max(1, +MAX_PAGES_RAW) : 25;
    const MAX_CONCURRENCY = Number.isFinite(+MAX_CONCURRENCY_RAW) ? Math.min(10, Math.max(1, +MAX_CONCURRENCY_RAW)) : 4;
    const REQUEST_TIMEOUT = Number.isFinite(+REQUEST_TIMEOUT_RAW) ? Math.min(120, Math.max(20, +REQUEST_TIMEOUT_RAW)) : 60;

    const startPageUrls = buildStartUrls({ startUrls, startUrl, url, category, location });
    if (!startPageUrls.length) {
        throw new Error('No valid start URLs resolved from input');
    }

    log.info(`Starting Clutch.co scraper with ${startPageUrls.length} start URL(s), max pages ${MAX_PAGES}, target ${RESULTS_WANTED}.`);

    const proxyConf = await buildProxyConfiguration(proxyConfiguration);

    const state = { saved: 0, listPages: 0, detailPages: 0, blocked: 0 };
    const updateStatus = () => Actor.setStatusMessage(`saved ${state.saved}/${RESULTS_WANTED} | list ${state.listPages} | detail ${state.detailPages} | blocked ${state.blocked}`);

    const seenDetailLinks = new Set();
    const seenBasicLinks = new Set();
    const seenListPages = new Set();

    const crawler = new CheerioCrawler({
        proxyConfiguration: proxyConf,
        maxConcurrency: MAX_CONCURRENCY,
        maxRequestRetries: 6,
        requestHandlerTimeoutSecs: REQUEST_TIMEOUT,
        additionalMimeTypes: ['application/xhtml+xml', 'text/html'],
        useSessionPool: true,
        persistCookiesPerSession: true,
        sessionPoolOptions: {
            maxPoolSize: MAX_CONCURRENCY * 5,
            sessionOptions: {
                maxUsageCount: 20,
                maxErrorScore: 3,
                errorScoreDecrement: 0.5,
            },
        },
        preNavigationHooks: [
            async ({ request }, gotOptions) => {
                const headers = headerGenerator.getHeaders({
                    browsers: [{ name: 'chrome', minVersion: 118, maxVersion: 127 }],
                    devices: Math.random() > 0.4 ? ['desktop'] : ['mobile'],
                    operatingSystems: ['windows', 'macos'],
                });
                const referer = request.userData?.referer || 'https://www.google.com/search?q=clutch+agencies';
                const delay = 350 + Math.floor(Math.random() * 600);
                await sleep(delay);

                gotOptions.headers = {
                    ...gotOptions.headers,
                    ...headers,
                    'accept-language': headers['accept-language'] || 'en-US,en;q=0.9',
                    referer,
                    'upgrade-insecure-requests': '1',
                    'sec-fetch-site': 'same-origin',
                    'sec-fetch-mode': 'navigate',
                    'sec-fetch-dest': 'document',
                };
            },
        ],
        failedRequestHandler: async ({ request, error }) => {
            state.blocked += 1;
            log.error(`Request failed for ${request.url}: ${error.message}`);
            await updateStatus();
        },
        async requestHandler(context) {
            const { request, $, response, session, enqueueLinks, crawler: crawlerInstance } = context;
            const label = request.userData?.label || 'LIST';
            const pageNo = request.userData?.pageNo || 1;
            const statusCode = response?.statusCode ?? 0;

            if (statusCode === 403 || statusCode === 429) {
                state.blocked += 1;
                session?.markBad?.();
                throw new Error(`Request blocked with status ${statusCode}`);
            }

            if (!$ || !$('body').length) {
                session?.markBad?.();
                throw new Error(`Empty body for ${request.url}`);
            }

            const normalizedUrl = normalizeUrl(request.url);
            if (label === 'LIST' && normalizedUrl && seenListPages.has(normalizedUrl)) {
                return;
            }
            if (label === 'LIST' && normalizedUrl) {
                seenListPages.add(normalizedUrl);
            }

            if (label === 'LIST') {
                state.listPages += 1;
                await updateStatus();

                const bodyText = $('body').text();
                if (bodyText.length < 200) {
                    session?.markBad?.();
                    throw new Error(`Blocked or empty list page (${bodyText.length} chars) at ${request.url}`);
                }

                const jsonLdBlocks = extractJsonLdScripts($);
                const jsonLdLinks = extractProfileLinksFromJsonLd(jsonLdBlocks, request.url);
                const domLinks = findAgencyLinks($, request.url);
                const candidates = [...new Set([...jsonLdLinks, ...domLinks])];
                const remaining = Math.max(RESULTS_WANTED - state.saved, 0);

                log.debug(`LIST ${request.url} page ${pageNo} -> ${candidates.length} candidates, remaining ${remaining}`);

                if (remaining > 0) {
                    if (collectDetails) {
                        const toEnqueue = filterNewLinks(candidates, seenDetailLinks, remaining);
                        if (toEnqueue.length) {
                            await enqueueLinks({
                                requests: toEnqueue.map((url) => ({
                                    url,
                                    userData: { label: 'DETAIL', referer: request.url },
                                })),
                            });
                            log.info(`Enqueued ${toEnqueue.length} detail pages from ${request.url}`);
                        }
                    } else {
                        const toPush = filterNewLinks(candidates, seenBasicLinks, remaining).map((url) => ({
                            url,
                            category_filter: category || null,
                            location_filter: location || null,
                            fetched_at: nowIso(),
                        }));
                        if (toPush.length) {
                            await Dataset.pushData(toPush);
                            state.saved += toPush.length;
                            await updateStatus();
                            log.info(`Stored ${toPush.length} basic items (no detail crawl).`);
                        }
                    }
                }

                if (pageNo < MAX_PAGES) {
                    const nextUrl = buildNextPageUrl($, request.url, pageNo);
                    if (nextUrl) {
                        const normalizedNext = normalizeUrl(nextUrl);
                        if (!normalizedNext || !seenListPages.has(normalizedNext)) {
                            await enqueueLinks({
                                requests: [createListRequest(nextUrl, pageNo + 1, request.url)],
                            });
                            log.debug(`Enqueued next listing page ${nextUrl}`);
                        }
                    } else {
                        log.debug(`No next page found for ${request.url}`);
                    }
                } else {
                    log.info(`Reached max_pages limit (${MAX_PAGES}) at ${request.url}`);
                }
                return;
            }

            if (label === 'DETAIL') {
                if (state.saved >= RESULTS_WANTED) {
                    await crawlerInstance.autoscaledPool?.abort();
                    return;
                }

                state.detailPages += 1;
                await updateStatus();

                const jsonLdBlocks = extractJsonLdScripts($);
                const organization = extractOrganizationFromJsonLd(jsonLdBlocks);
                const item = extractDetailItem($, organization, request, {
                    category,
                    location,
                    referer: request.userData?.referer,
                });

                if (!item) {
                    session?.markBad?.();
                    throw new Error(`Unable to extract detail data for ${request.url}`);
                }

                await Dataset.pushData(item);
                state.saved += 1;
                await updateStatus();
                log.info(`Saved ${state.saved}/${RESULTS_WANTED}: ${item.name}`);

                if (state.saved >= RESULTS_WANTED) {
                    await crawlerInstance.autoscaledPool?.abort();
                }
            }
        },
    });

    const initialRequests = startPageUrls.map((url) => createListRequest(url));
    await crawler.run(initialRequests);
    log.info(`Finished scraping run. Saved ${state.saved} agencies (list pages ${state.listPages}, detail pages ${state.detailPages}, blocked ${state.blocked}).`);
    await updateStatus();
}

main()
    .then(() => Actor.exit())
    .catch(async (err) => {
        log.error(`Crawler failed: ${err.message}`);
        await Actor.setStatusMessage(`Failed: ${err.message}`);
        Actor.exit({ exitCode: 1, statusMessage: err.message });
    });
