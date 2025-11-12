import { Actor, log } from 'apify';
import { CheerioCrawler, Dataset } from 'crawlee';
import { load as cheerioLoad } from 'cheerio';
import { HeaderGenerator } from 'header-generator';
import { JSDOM } from 'jsdom';

await Actor.init();

const BASE_URL = 'https://clutch.co';

const headerGenerator = new HeaderGenerator({
    browsers: [
        { name: 'chrome', minVersion: 118, maxVersion: 129 },
        { name: 'edge', minVersion: 118, maxVersion: 128 },
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

const canonicalizeProfileUrl = (href) => {
    if (!href) return null;
    const normalized = normalizeUrl(href);
    if (!normalized) return null;
    try {
        const parsed = new URL(normalized);
        parsed.hash = '';
        parsed.search = '';
        if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
            parsed.pathname = parsed.pathname.slice(0, -1);
        }
        return parsed.href;
    } catch {
        return normalized;
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

const extractServicesFromPage = ($$) => {
    const services = [];
    
    // Strategy 1: Extract from "Service Lines" section with percentages
    const serviceLineSelectors = [
        '[data-test="service-line"]',
        '.service-line',
        '.service-lines li',
        '.services-section li',
        'section[id*="service"] li',
    ];
    
    serviceLineSelectors.forEach((selector) => {
        $$(selector).each((_, el) => {
            const text = $$(el).text().trim();
            // Match patterns like "Mobile App Development 40%"
            if (text && text.length > 2) {
                const cleanText = text.replace(/\s+/g, ' ').trim();
                if (!services.some(s => s.includes(cleanText.split(/\d+%/)[0].trim()))) {
                    services.push(cleanText);
                }
            }
        });
    });
    
    // Strategy 2: Fallback to general service tags/links
    if (services.length === 0) {
        const fallbackSelectors = [
            '.service-tags a',
            '.service-tags span',
            '.services-list li',
            '.specializations a',
            '.specializations span',
            '.service-chips li',
            '[data-test="service"]',
        ];
        
        fallbackSelectors.forEach((selector) => {
            $$(selector).each((_, el) => {
                const text = $$(el).text().trim();
                if (text && text.length > 1 && !services.includes(text)) {
                    services.push(text);
                }
            });
        });
    }
    
    return services.slice(0, 20);
};

const extractIndustriesFromPage = ($$) => {
    const industries = [];
    const selectors = [
        '[data-test="industry"]',
        '.industry-tags a',
        '.industry-tags span',
        '.industry-list li',
        '.industries-section li',
        '.specialization-list li',
        'section[id*="industr"] li',
        '.industry-chip',
    ];
    selectors.forEach((selector) => {
        $$(selector).each((_, el) => {
            const text = $$(el).text().trim();
            if (text && text.length > 1 && !industries.includes(text)) {
                industries.push(text);
            }
        });
    });
    return industries.slice(0, 20);
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
    const locations = [];
    const selectors = [
        '[data-test="location"]',
        '[data-test="locations"]',
        '.location',
        '.locations li',
        '.locality',
        '.quick-stats__location',
        '.profile-summary__location',
        '.office-locations li',
        '.headquarters',
        'section[id*="location"] li',
    ];
    selectors.forEach((selector) => {
        $$(selector).each((_, el) => {
            const text = $$(el).text().trim().replace(/\s+/g, ' ');
            // Filter out noise like "Locations" headers
            if (text && text.length > 2 && !text.toLowerCase().includes('location') && !locations.includes(text)) {
                locations.push(text);
            }
        });
    });
    return locations.slice(0, 10);
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
            if (/website|visit/i.test(text)) link = $$(el).attr('href');
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

const filterNewLinks = (links, seenSet, limit = Infinity, { canonicalize = normalizeUrl } = {}) => {
    if (!links?.length || !limit) return [];
    const unique = [];
    for (const link of links) {
        if (unique.length >= limit) break;
        const normalized = canonicalize(link);
        if (!normalized || seenSet.has(normalized)) continue;
        seenSet.add(normalized);
        unique.push(normalized);
    }
    return unique;
};

const findAgencyLinks = ($$, base) => {
    const links = new Set();
    
    // Updated selectors for Clutch.co's current structure (Nov 2025)
    const selectors = [
        // Profile links in list items
        'li a[href*="/profile/"]',
        'article a[href*="/profile/"]',
        // Company name links
        '.company-name a[href*="/profile/"]',
        '.company_title a[href*="/profile/"]',
        // Directory/provider listings
        '.directory-provider a[href*="/profile/"]',
        '.provider-info a[href*="/profile/"]',
        '.provider a[href*="/profile/"]',
        // Header/title links
        'h3 > a[href*="/profile/"]',
        'h2 > a[href*="/profile/"]',
        'h4 > a[href*="/profile/"]',
        // General profile links (fallback)
        'a[href^="/profile/"]',
    ];
    
    selectors.forEach((selector) => {
        $$(selector).each((_, el) => {
            const href = $$(el).attr('href');
            if (!href || !href.includes('/profile/')) return;
            const abs = toAbs(href, base);
            if (abs) links.add(abs);
        });
    });
    
    // Fallback: find all links containing '/profile/' if none found
    if (links.size === 0) {
        $$('a[href]').each((_, el) => {
            const href = $$(el).attr('href');
            if (href && href.includes('/profile/')) {
                const abs = toAbs(href, base);
                if (abs) links.add(abs);
            }
        });
    }
    
    return [...links];
};

const buildNextPageUrl = ($$, currentUrl, currentPage = 1) => {
    // Updated pagination for Clutch.co /directory/ pages (Dec 2025)
    let candidate = null;
    
    // Strategy 1: Look for "Next Page" / "Go to Next Page" links
    const nextPageSelectors = [
        'a[rel="next"]',
        'a[aria-label="Next"]',
        'a[aria-label*="next page" i]',
        'a[aria-label*="Go to Next" i]',
    ];
    
    for (const selector of nextPageSelectors) {
        if (candidate) break;
        $$(selector).each((_, el) => {
            if (candidate) return false;
            const href = $$(el).attr('href');
            if (href && href.trim()) {
                candidate = href;
                return false;
            }
        });
    }
    
    // Strategy 2: Find pagination container and look for next page link
    if (!candidate) {
        const paginationContainers = ['nav[aria-label*="pagination" i]', '.pagination', 'nav'];
        
        for (const containerSel of paginationContainers) {
            if (candidate) break;
            $$(containerSel).each((_, container) => {
                if (candidate) return false;
                
                // Look for next page number link within pagination
                const $container = $$(container);
                $container.find('a[href]').each((_, link) => {
                    if (candidate) return false;
                    
                    const href = $$(link).attr('href');
                    const text = $$(link).text().trim();
                    const ariaLabel = $$(link).attr('aria-label') || '';
                    
                    // Check for "Next", page number, or arrow symbols
                    const isNext = 
                        text.toLowerCase().includes('next') ||
                        text === '›' ||
                        text === '→' ||
                        text === '»' ||
                        ariaLabel.toLowerCase().includes('next') ||
                        text === String(currentPage + 1);
                    
                    if (isNext && href && href.trim()) {
                        candidate = href;
                        return false;
                    }
                });
            });
        }
    }
    
    // Strategy 3: Look for URL with ?page= or &page= parameter (next page number)
    if (!candidate) {
        $$('a[href]').each((_, el) => {
            if (candidate) return false;
            const href = $$(el).attr('href');
            
            if (href && (href.includes('?page=') || href.includes('&page='))) {
                const match = href.match(/[?&]page=(\d+)/);
                if (match && parseInt(match[1]) === currentPage + 1) {
                    candidate = href;
                    return false;
                }
            }
        });
    }
    
    // Strategy 4: Build next page URL manually
    // Clutch.co format: /directory/[category]?page=X
    if (!candidate) {
        try {
            const parsed = new URL(currentUrl);
            const currentPageParam = parsed.searchParams.get('page');
            
            // If no page param, we're on page 1
            if (!currentPageParam && currentPage === 1) {
                parsed.searchParams.set('page', '2');
                candidate = parsed.href;
            }
            // If page param exists and matches current page, increment it
            else if (currentPageParam && parseInt(currentPageParam) === currentPage) {
                parsed.searchParams.set('page', String(currentPage + 1));
                candidate = parsed.href;
            }
        } catch {
            // URL parsing failed, try simple parameter append
            if (!currentUrl.includes('?')) {
                candidate = `${currentUrl}?page=${currentPage + 1}`;
            } else if (currentUrl.includes('?page=')) {
                candidate = currentUrl.replace(/page=\d+/, `page=${currentPage + 1}`);
            } else {
                candidate = `${currentUrl}&page=${currentPage + 1}`;
            }
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
        // Fixed: Use /directory/ path format (actual Clutch.co structure)
        const slug = category 
            ? `/directory/${String(category).trim().replace(/^\/+|\/+$/g, '')}` 
            : '/directory';
        const built = new URL(`${BASE_URL}${slug}`);
        if (location) built.searchParams.set('location', String(location).trim());
        urls.push(built.href);
    }
    const normalized = urls
        .map((href) => normalizeUrl(toAbs(href)))
        .filter(Boolean);
    return [...new Set(normalized)];
};

const collectProfileLinksFromState = (node, links, seen = new Set()) => {
    if (node === null || node === undefined) return;
    if (typeof node === 'string') {
        if (node.includes('/profile/')) {
            const absolute = toAbs(node);
            if (absolute) links.add(absolute);
        }
        return;
    }
    if (typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
        node.forEach((entry) => collectProfileLinksFromState(entry, links, seen));
        return;
    }
    Object.values(node).forEach((value) => collectProfileLinksFromState(value, links, seen));
};

const STATE_PATTERNS = [
    /window\.__NUXT__\s*=\s*(\{[\s\S]*?\});/g,
    /window\.__NEXT_DATA__\s*=\s*(\{[\s\S]*?\});/g,
    /window\.__APOLLO_STATE__\s*=\s*(\{[\s\S]*?\});/g,
    /window\.__CLUTCH_STATE__\s*=\s*(\{[\s\S]*?\});/g,
];

const evaluateStatePayload = (payload) => {
    if (!payload) return null;
    try {
        return JSON.parse(payload);
    } catch {
        try {
            const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' });
            dom.window.eval(`window.__STATE__ = ${payload}`);
            const state = dom.window.__STATE__;
            dom.window.close?.();
            return state;
        } catch {
            return null;
        }
    }
};

const extractEmbeddedState = (html) => {
    const states = [];
    const links = new Set();
    if (!html) return { states, profileLinks: [] };

    for (const pattern of STATE_PATTERNS) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(html)) !== null) {
            const payload = match[1];
            const parsed = evaluateStatePayload(payload);
            if (parsed && typeof parsed === 'object') {
                states.push(parsed);
                collectProfileLinksFromState(parsed, links);
            }
        }
    }
    return { states, profileLinks: [...links] };
};

const findOrganizationFromState = (states) => {
    const seen = new Set();
    const walk = (node) => {
        if (!node || typeof node !== 'object' || seen.has(node)) return null;
        seen.add(node);
        if (node.slug && typeof node.slug === 'string' && node.slug.includes('/profile/')) {
            return node;
        }
        if (node.profileUrl || node.website || node.name) {
            const candidateSlug = node.profileUrl || node.url || node.website;
            if (typeof candidateSlug === 'string' && candidateSlug.includes('/profile/')) {
                return node;
            }
        }
        for (const value of Object.values(node)) {
            if (value && typeof value === 'object') {
                const found = walk(value);
                if (found) return found;
            }
        }
        return null;
    };

    for (const state of states) {
        const found = walk(state);
        if (found) return found;
    }
    return null;
};

const parseCookiesInput = (cookies) => {
    if (!cookies) return null;
    if (Array.isArray(cookies)) return cookies.filter(Boolean).join('; ');
    if (typeof cookies === 'object') {
        return Object.entries(cookies)
            .filter(([, value]) => value !== undefined && value !== null)
            .map(([key, value]) => `${key}=${value}`)
            .join('; ');
    }
    return String(cookies);
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

const enrichWithState = (item, stateOrganization) => {
    if (!stateOrganization) return item;
    const clone = { ...item };
    if (!clone.website && typeof stateOrganization.website === 'string') clone.website = stateOrganization.website;
    if (!clone.phone && typeof stateOrganization.phone === 'string') clone.phone = stateOrganization.phone;
    if (!clone.email && typeof stateOrganization.email === 'string') clone.email = stateOrganization.email;
    if (!clone.min_budget && stateOrganization.minBudget) clone.min_budget = stateOrganization.minBudget;
    if (!clone.hourly_rate && stateOrganization.hourlyRate) clone.hourly_rate = stateOrganization.hourlyRate;
    if (!clone.company_size && stateOrganization.companySize) clone.company_size = stateOrganization.companySize;
    if (!clone.services && Array.isArray(stateOrganization.services)) clone.services = stateOrganization.services;
    if (!clone.industries && Array.isArray(stateOrganization.industries)) clone.industries = stateOrganization.industries;
    if (!clone.awards && Array.isArray(stateOrganization.awards)) clone.awards = stateOrganization.awards;
    if (!clone.description && typeof stateOrganization.description === 'string') clone.description = stateOrganization.description;
    return clone;
};

const extractDetailItem = ($, organization, stateOrganization, request, meta, html) => {
    // Remove script and style tags before extracting text
    $('script, style, noscript').remove();
    const bodyText = $('body').text() || cleanText(html);
    
    const name = organization?.name
        ?? stateOrganization?.name
        ?? $('[data-test="profile-name"]').first().text().trim()
        ?? $('h1').first().text().trim()
        ?? null;
    if (!name) return null;

    const ratingText = $('[class*="rating"]').first().text().trim();
    const ratingValue = parseNumber(
        organization?.aggregateRating?.ratingValue
        ?? stateOrganization?.rating
        ?? ratingText.match(/(\d+(\.\d+)?)/)?.[1],
    );
    const reviewText = $('[data-test="review-count"]').first().text().trim()
        || stateOrganization?.reviewCount
        || bodyText.match(/([0-9,]+)\s+reviews?/i)?.[1];
    const reviewCount = parseInteger(organization?.aggregateRating?.reviewCount ?? reviewText);
    const contacts = collectContactInfo($);
    const services = extractServicesFromPage($);
    const industries = extractIndustriesFromPage($);
    const awards = extractAwards($);
    const testimonials = extractTestimonials($);
    const locations = extractLocationsFromPage($);

    // Enhanced description extraction with multiple strategies
    let description = null;
    
    // Strategy 1: Look for highlights/about section with proper selectors
    const descriptionSelectors = [
        '[data-test="about-text"]',
        '[data-test="highlights"]',
        '.highlights-text',
        '.about-section p',
        '#about p',
        '.company-description',
        '.profile-summary p',
        'section[id*="highlight"] p',
        'section[id*="about"] p',
    ];
    
    for (const selector of descriptionSelectors) {
        if (description) break;
        const text = $(selector).first().text().trim();
        if (text && text.length > 50 && !text.includes('gtag') && !text.includes('window.')) {
            description = text.replace(/\s+/g, ' ').slice(0, 1000);
            break;
        }
    }
    
    // Strategy 2: Get from state or fallback to cleaned body text
    if (!description) {
        description = stateOrganization?.description || bodyText.slice(0, 800).replace(/\s+/g, ' ');
    }
    
    // Clean description: remove JS artifacts
    if (description) {
        description = description
            .replace(/gtag\([^)]+\);?/g, '')
            .replace(/window\.[^;]+;?/g, '')
            .replace(/\{[^}]*\}/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    const minBudget = $('[data-test="minimum-project-size"]').text().trim()
        || $('[data-test="min-project-size"]').text().trim()
        || organization?.priceRange
        || stateOrganization?.minBudget
        || bodyText.match(/Min(?:imum)? project size[:\s]*([^\n]+)/i)?.[1]?.trim()
        || null;

    const hourlyRate = $('[data-test="avg-hourly-rate"]').text().trim()
        || $('[data-test="hourly-rate"]').text().trim()
        || stateOrganization?.hourlyRate
        || bodyText.match(/Hourly rate:?([^\n]+)/i)?.[1]?.trim()
        || null;

    const companySize = $('[data-test="employees"]').text().trim()
        || organization?.numberOfEmployees
        || stateOrganization?.companySize
        || bodyText.match(/Employees[:\s]*([^\n]+)/i)?.[1]?.trim()
        || null;

    // Extract additional fields from profile page
    const yearFounded = $('[data-test="year-founded"]').text().trim()
        || bodyText.match(/Year founded[:\s]*Founded\s*(\d{4})/i)?.[1]
        || bodyText.match(/Founded[:\s]*(\d{4})/i)?.[1]
        || stateOrganization?.yearFounded
        || null;

    const languages = $('[data-test="languages"]').text().trim()
        || bodyText.match(/Languages[:\s]*(\d+)\s*Languages?/i)?.[1]
        || stateOrganization?.languages
        || null;

    const timezones = $('[data-test="timezones"]').text().trim()
        || bodyText.match(/Timezones[:\s]*(\d+)\s*Timezones?/i)?.[1]
        || stateOrganization?.timezones
        || null;

    // Extract highlights/tagline (e.g., "Launch Ventures, not Apps")
    const highlights = $('[data-test="highlights"]').first().text().trim()
        || $('h2').first().text().trim()
        || stateOrganization?.highlights
        || null;

    // Extract focus areas and clients if available
    const focusAreas = [];
    $('[data-test="focus"] li, .focus-section li, section[id*="focus"] li').each((_, el) => {
        const text = $(el).text().trim();
        if (text && text.length > 1) focusAreas.push(text);
    });

    const clientsList = [];
    $('[data-test="client"] li, .clients-section li, section[id*="client"] li').each((_, el) => {
        const text = $(el).text().trim();
        if (text && text.length > 1) clientsList.push(text);
    });

    const item = enrichWithState({
        name,
        url: request.url,
        slug: request.url.split('/profile/').pop() || null,
        rating: ratingValue,
        review_count: reviewCount,
        verified: $('[class*="verified"]').first().text().trim() || stateOrganization?.verification || null,
        highlights: highlights || null,
        min_budget: minBudget,
        hourly_rate: hourlyRate,
        company_size: companySize,
        year_founded: yearFounded,
        languages: languages,
        timezones: timezones,
        primary_location: organization?.address?.addressLocality || locations[0] || stateOrganization?.primaryLocation || null,
        locations: locations.length ? locations : stateOrganization?.locations || null,
        services: services.length ? services : null,
        industries: industries.length ? industries : null,
        focus_areas: focusAreas.length ? focusAreas : null,
        clients: clientsList.length ? clientsList.slice(0, 10) : null,
        awards: awards.length ? awards : null,
        testimonials: testimonials.length ? testimonials : null,
        description: description || null,
        website: contacts.website || organization?.url || stateOrganization?.website || null,
        phone: contacts.phone || organization?.telephone || stateOrganization?.phone || null,
        email: contacts.email || stateOrganization?.email || null,
        address: formatAddress(organization?.address) || stateOrganization?.address || null,
        json_ld: organization || null,
        category_filter: meta.category || null,
        location_filter: meta.location || null,
        fetched_at: nowIso(),
        meta: {
            referer: meta.referer || null,
            detail_body_length: bodyText.length,
        },
    }, stateOrganization);

    return item;
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
        requestHandlerTimeoutSecs: REQUEST_TIMEOUT_RAW = 70,
        debugLog = false,
        cookies,
        extraHeaders = {},
    } = input;

    if (typeof category !== 'string' || typeof location !== 'string') {
        throw new Error('Invalid input: category and location must be strings');
    }

    if (debugLog) log.setLevel(log.LEVELS.DEBUG);

    const RESULTS_WANTED = Number.isFinite(+RESULTS_WANTED_RAW) ? Math.max(1, +RESULTS_WANTED_RAW) : Number.MAX_SAFE_INTEGER;
    const MAX_PAGES = Number.isFinite(+MAX_PAGES_RAW) ? Math.max(1, +MAX_PAGES_RAW) : 25;
    const MAX_CONCURRENCY = Number.isFinite(+MAX_CONCURRENCY_RAW) ? Math.min(10, Math.max(1, +MAX_CONCURRENCY_RAW)) : 4;
    const REQUEST_TIMEOUT = Number.isFinite(+REQUEST_TIMEOUT_RAW) ? Math.min(180, Math.max(20, +REQUEST_TIMEOUT_RAW)) : 70;

    const startPageUrls = buildStartUrls({ startUrls, startUrl, url, category, location });
    if (!startPageUrls.length) {
        throw new Error('No valid start URLs resolved from input');
    }

    const cookieHeader = parseCookiesInput(cookies);
    const proxyConf = await buildProxyConfiguration(proxyConfiguration);

    log.info(`Starting Clutch.co Cheerio scraper with ${startPageUrls.length} start URL(s), max pages ${MAX_PAGES}, target ${RESULTS_WANTED}.`);

    const state = { saved: 0, listPages: 0, detailPages: 0, blocked: 0 };
    const updateStatus = () => Actor.setStatusMessage(`saved ${state.saved}/${RESULTS_WANTED} | list ${state.listPages} | detail ${state.detailPages} | blocked ${state.blocked}`);

    const seenDetailLinks = new Set();
    const seenBasicLinks = new Set();
    const seenListPages = new Set();

    const crawler = new CheerioCrawler({
        proxyConfiguration: proxyConf,
        maxConcurrency: MAX_CONCURRENCY,
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
            async ({ request, session }, requestAsBrowserOptions) => {
                const generatedHeaders = headerGenerator.getHeaders({
                    browsers: [{ name: 'chrome', minVersion: 118, maxVersion: 129 }],
                    devices: Math.random() > 0.4 ? ['desktop'] : ['mobile'],
                    operatingSystems: ['windows', 'macos'],
                });
                const baseHeaders = {
                    ...generatedHeaders,
                    ...extraHeaders,
                    'accept-language': extraHeaders['accept-language'] || 'en-US,en;q=0.9',
                    referer: request.userData?.referer || 'https://www.google.com/',
                    'upgrade-insecure-requests': '1',
                    'sec-fetch-site': 'same-origin',
                    'sec-fetch-mode': 'navigate',
                    'sec-fetch-dest': 'document',
                };
                if (cookieHeader && !baseHeaders.cookie) baseHeaders.cookie = cookieHeader;

                // Session cookies are automatically handled by Crawlee v3
                // The persistCookiesPerSession option manages cookies across requests
                
                requestAsBrowserOptions.headers = baseHeaders;
                requestAsBrowserOptions.useHeaderGenerator = false;

                const delay = 300 + Math.floor(Math.random() * 600);
                await sleep(delay);
            },
        ],
        postNavigationHooks: [
            async ({ response, session }) => {
                const statusCode = response?.statusCode ?? 0;
                if (statusCode >= 400) {
                    session?.markBad?.();
                } else {
                    session?.markGood?.();
                }
            },
        ],
        failedRequestHandler: async ({ request, error }) => {
            state.blocked += 1;
            log.error(`Request failed for ${request.url}: ${error.message}`);
            await updateStatus();
        },
        async requestHandler(context) {
            const {
                request,
                $,
                body,
                response,
                session,
                enqueueLinks,
            } = context;
            const label = request.userData?.label || 'LIST';
            const pageNo = request.userData?.pageNo || 1;
            const statusCode = response?.statusCode ?? 0;

            const html = typeof body === 'string'
                ? body
                : Buffer.isBuffer(body)
                    ? body.toString('utf8')
                    : $.html() || '';

            if (statusCode === 403 || statusCode === 429) {
                state.blocked += 1;
                session?.markBad?.();
                throw new Error(`Request blocked with status ${statusCode}`);
            }

            if (!$ || !$('body').length) {
                session?.markBad?.();
                throw new Error(`Empty body for ${request.url}`);
            }

            const embeddedState = extractEmbeddedState(html);

            const normalizedUrl = normalizeUrl(request.url);
            if (label === 'LIST' && normalizedUrl) {
                if (seenListPages.has(normalizedUrl)) return;
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
                const stateLinks = embeddedState.profileLinks || [];
                const candidates = [...new Set([...jsonLdLinks, ...domLinks, ...stateLinks])];
                const remaining = Math.max(RESULTS_WANTED - state.saved, 0);

                log.info(`LIST ${request.url} page ${pageNo} -> Found: ${domLinks.length} DOM, ${jsonLdLinks.length} JSON-LD, ${stateLinks.length} state = ${candidates.length} total candidates, remaining ${remaining}`);

                if (remaining > 0) {
                    if (collectDetails) {
                        const toEnqueue = filterNewLinks(candidates, seenDetailLinks, remaining, { canonicalize: canonicalizeProfileUrl });
                        if (toEnqueue.length) {
                            await enqueueLinks({
                                urls: toEnqueue,
                                userData: { label: 'DETAIL', referer: request.url },
                            });
                            log.info(`Enqueued ${toEnqueue.length} detail pages from ${request.url}`);
                        }
                    } else {
                        const toPush = filterNewLinks(candidates, seenBasicLinks, remaining, { canonicalize: canonicalizeProfileUrl }).map((link) => ({
                            url: link,
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

                if (state.saved >= RESULTS_WANTED) {
                    await crawler.autoscaledPool?.abort();
                    return;
                }

                if (pageNo < MAX_PAGES) {
                    const nextUrl = buildNextPageUrl($, request.url, pageNo);
                    if (nextUrl) {
                        const normalizedNext = normalizeUrl(nextUrl);
                        if (!normalizedNext || !seenListPages.has(normalizedNext)) {
                            await enqueueLinks({
                                urls: [nextUrl],
                                userData: { label: 'LIST', pageNo: pageNo + 1, referer: request.url },
                            });
                            log.info(`✓ Enqueued next page ${pageNo + 1}: ${nextUrl}`);
                        } else {
                            log.info(`✗ Next page ${pageNo + 1} already seen: ${normalizedNext}`);
                        }
                    } else {
                        log.info(`✗ No next page found for page ${pageNo} at ${request.url}`);
                    }
                } else {
                    log.info(`✗ Reached max_pages limit (${MAX_PAGES}) at page ${pageNo}`);
                }

                return;
            }

            if (label === 'DETAIL') {
                if (state.saved >= RESULTS_WANTED) {
                    await crawler.autoscaledPool?.abort();
                    return;
                }

                state.detailPages += 1;
                await updateStatus();

                const jsonLdBlocks = extractJsonLdScripts($);
                const organization = extractOrganizationFromJsonLd(jsonLdBlocks);
                const stateOrganization = findOrganizationFromState(embeddedState.states);
                const item = extractDetailItem($, organization, stateOrganization, request, {
                    category,
                    location,
                    referer: request.userData?.referer,
                }, html);

                if (!item) {
                    session?.markBad?.();
                    throw new Error(`Unable to extract detail data for ${request.url}`);
                }

                await Dataset.pushData(item);
                state.saved += 1;
                await updateStatus();
                log.info(`Saved ${state.saved}/${RESULTS_WANTED}: ${item.name}`);

                if (state.saved >= RESULTS_WANTED) {
                    await crawler.autoscaledPool?.abort();
                }
            }
        },
    });

    const initialRequests = startPageUrls.map((link) => createListRequest(link));
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
