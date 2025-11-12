# Clutch.co Agencies Scraper

## Introduction

<p>This Apify Actor scrapes agency listings from Clutch.co, a leading directory of B2B service providers. It collects comprehensive information about agencies, including their ratings, services offered, contact details, and more. The Actor handles pagination automatically and can optionally visit individual agency profile pages for detailed information.</p>

<p>Perfect for market research, lead generation, and competitive analysis in the B2B services space.</p>

## Use Cases

<ul>
<li><strong>Market Research</strong>: Analyze trends in agency services, ratings, and pricing across different categories and locations.</li>
<li><strong>Lead Generation</strong>: Build lists of qualified agencies for outreach and partnership opportunities.</li>
<li><strong>Competitive Analysis</strong>: Compare agency offerings, client feedback, and market positioning.</li>
<li><strong>Data Collection</strong>: Gather structured data on service providers for reporting or integration into other systems.</li>
</ul>

## Input

<p>The Actor accepts the following input parameters. All parameters are optional unless specified otherwise.</p>

<table>
<thead>
<tr>
<th>Parameter</th>
<th>Type</th>
<th>Description</th>
<th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>category</code></td>
<td>string</td>
<td>Agency category to filter by (e.g., "advertising", "web-development"). Leave empty for all categories.</td>
<td>Empty</td>
</tr>
<tr>
<td><code>location</code></td>
<td>string</td>
<td>Location to filter agencies (e.g., "Toronto", "New York"). Leave empty for global results.</td>
<td>Empty</td>
</tr>
<tr>
<td><code>startUrls</code></td>
<td>array</td>
<td>Optional array of listing URLs (strings or objects with <code>url</code>). Overrides automatic category/location URL generation.</td>
<td>Derived from category/location</td>
</tr>
<tr>
<td><code>results_wanted</code></td>
<td>integer</td>
<td>Maximum number of agencies to collect. Set to a high number or leave empty to collect all available.</td>
<td>100</td>
</tr>
<tr>
<td><code>max_pages</code></td>
<td>integer</td>
<td>Safety limit on the number of listing pages to visit.</td>
<td>20</td>
</tr>
<tr>
<td><code>collectDetails</code></td>
<td>boolean</td>
<td>If enabled, visits each agency profile page for full details. Disable for faster basic data collection.</td>
<td>true</td>
</tr>
<tr>
<td><code>proxyConfiguration</code></td>
<td>object</td>
<td>Proxy settings for reliable scraping. Defaults to Apify Residential proxy if available.</td>
<td>Apify Proxy (Residential)</td>
</tr>
<tr>
<td><code>maxConcurrency</code></td>
<td>integer</td>
<td>Upper bound for concurrent HTTP requests. Tune based on proxy capacity (1-10).</td>
<td>4</td>
</tr>
<tr>
<td><code>requestHandlerTimeoutSecs</code></td>
<td>integer</td>
<td>Timeout per request for the Cheerio crawler.</td>
<td>60</td>
</tr>
<tr>
<td><code>debugLog</code></td>
<td>boolean</td>
<td>Enable verbose logging to troubleshoot blocking or parsing issues.</td>
<td>false</td>
</tr>
<tr>
<td><code>cookies</code></td>
<td>string | array | object</td>
<td>Optional cookie payload that will be injected into every HTTP request (useful for reusing a known <code>cf_clearance</code>).</td>
<td>Empty</td>
</tr>
<tr>
<td><code>extraHeaders</code></td>
<td>object</td>
<td>Key/value map of headers (e.g., <code>{"x-forwarded-for": "..."} </code>) merged into the generated stealth headers.</td>
<td>Empty</td>
</tr>
</tbody>
</table>

<p>You can also provide single <code>startUrl</code> or <code>url</code> fields (strings) for convenience; they follow the same behavior as items inside <code>startUrls</code>.</p>


### Usage Example

<p>To run the Actor via the Apify Console:</p>
<ol>
<li>Go to the Actor's page on Apify.</li>
<li>Click "Run" and configure the input parameters.</li>
<li>For example, set <code>category</code> to "advertising", <code>location</code> to "Toronto", and <code>results_wanted</code> to 50.</li>
<li>Start the run and monitor progress.</li>
</ol>

<p>Via API:</p>
<pre><code>curl -X POST "https://api.apify.com/v2/acts/YOUR_ACTOR_ID/runs" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "category": "advertising",
    "location": "Toronto",
    "results_wanted": 50
  }'</code></pre>

## Output

<p>The Actor outputs a dataset of agency records. Each record is a JSON object with the following structure:</p>

<table>
<thead>
<tr>
<th>Field</th>
<th>Type</th>
<th>Description</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>name</code></td>
<td>string</td>
<td>Agency name</td>
</tr>
<tr>
<td><code>slug</code></td>
<td>string</td>
<td>Profile slug derived from the URL</td>
</tr>
<tr>
<td><code>url</code></td>
<td>string</td>
<td>Clutch.co profile URL</td>
</tr>
<tr>
<td><code>rating</code></td>
<td>number</td>
<td>Average client rating (e.g., 4.8)</td>
</tr>
<tr>
<td><code>review_count</code></td>
<td>integer</td>
<td>Number of published reviews</td>
</tr>
<tr>
<td><code>verified</code></td>
<td>string</td>
<td>Verification badge text when available</td>
</tr>
<tr>
<td><code>min_budget</code></td>
<td>string</td>
<td>Minimum project budget (e.g., "$5,000+")</td>
</tr>
<tr>
<td><code>hourly_rate</code></td>
<td>string</td>
<td>Hourly rate range (e.g., "$100 - $149 / hr")</td>
</tr>
<tr>
<td><code>company_size</code></td>
<td>string</td>
<td>Company size (e.g., "250 - 999")</td>
</tr>
<tr>
<td><code>primary_location</code></td>
<td>string</td>
<td>Main city shown on the profile</td>
</tr>
<tr>
<td><code>locations</code></td>
<td>array</td>
<td>All office locations detected on the page</td>
</tr>
<tr>
<td><code>services</code></td>
<td>array</td>
<td>List of services offered</td>
</tr>
<tr>
<td><code>industries</code></td>
<td>array</td>
<td>Industries served</td>
</tr>
<tr>
<td><code>awards</code></td>
<td>array</td>
<td>Recognition and awards badges</td>
</tr>
<tr>
<td><code>testimonials</code></td>
<td>array</td>
<td>Sample testimonial snippets (up to 3)</td>
</tr>
<tr>
<td><code>description</code></td>
<td>string</td>
<td>About section text</td>
</tr>
<tr>
<td><code>website</code></td>
<td>string</td>
<td>Agency website URL</td>
</tr>
<tr>
<td><code>phone</code></td>
<td>string</td>
<td>Primary phone number</td>
</tr>
<tr>
<td><code>email</code></td>
<td>string</td>
<td>Contact email when available</td>
</tr>
<tr>
<td><code>address</code></td>
<td>string</td>
<td>Formatted JSON-LD address</td>
</tr>
<tr>
<td><code>category_filter</code></td>
<td>string</td>
<td>Category passed in the input (for auditing)</td>
</tr>
<tr>
<td><code>location_filter</code></td>
<td>string</td>
<td>Location passed in the input</td>
</tr>
<tr>
<td><code>fetched_at</code></td>
<td>string</td>
<td>ISO timestamp of the detail scrape</td>
</tr>
<tr>
<td><code>meta</code></td>
<td>object</td>
<td>Additional crawl metadata (referer, body size, etc.)</td>
</tr>
</tbody>
</table>

### Sample Output

<pre><code>[
  {
    "name": "Power Digital",
    "slug": "power-digital",
    "url": "https://clutch.co/profile/power-digital",
    "rating": 4.8,
    "review_count": 182,
    "verified": "Premier Verified",
    "min_budget": "$5,000+",
    "hourly_rate": "$100 - $149 / hr",
    "company_size": "250 - 999",
    "primary_location": "San Diego, CA",
    "locations": ["San Diego, CA", "New York, NY"],
    "services": ["Advertising", "Social Media Marketing", "Pay Per Click"],
    "industries": ["Consumer products", "Financial services"],
    "awards": ["2024 Clutch Champion"],
    "testimonials": ["They act like an extension of our in-house team..."],
    "description": "Power Digital is a tech-enabled growth firm...",
    "website": "https://powerdigitalmarketing.com",
    "phone": "+1 123 456 7890",
    "email": "hello@powerdigital.com",
    "address": "225 Broadway, San Diego, CA 92101, United States",
    "category_filter": "advertising",
    "location_filter": "San Diego",
    "fetched_at": "2025-11-12T05:00:00.000Z",
    "meta": {
      "referer": "https://clutch.co/advertising",
      "detail_body_length": 24512
    }
  }
]</code></pre>

<p>You can download the dataset in JSON, CSV, or other formats from the Apify Console after the run completes.</p>

## Miscellaneous

<ul>
<li><strong>Limits and Performance</strong>: Concurrency, smart delays, and autoscaled session pools are configurable so you can tune speed vs. stealth.</li>
<li><strong>JS Rendering Assist</strong>: Inline hydration data is evaluated through <code>jsdom</code> plus <code>got-scraping</code>/<code>header-generator</code> so we mimic a modern browser without launching a heavyweight headless browser.</li>
<li><strong>Proxy Strategy</strong>: Residential or high-quality datacenter proxies are strongly recommended; the actor falls back to direct connections but blocking is likely.</li>
<li><strong>Logging</strong>: Enable <code>debugLog</code> to inspect pagination, session health, and blocking diagnostics right in the Apify console.</li>
<li><strong>Data Freshness</strong>: Results reflect the current state of Clutch.co listings at the time of scraping.</li>
<li><strong>Support</strong>: For issues or questions, check the Actor's discussion forum on Apify or contact support.</li>
</ul>

<p>This Actor is designed for ethical and legal use only. Always comply with Clutch.co's terms of service and applicable laws.</p>
