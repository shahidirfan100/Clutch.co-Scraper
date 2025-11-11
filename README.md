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
<td>Proxy settings for reliable scraping. Use Apify Proxy for best results.</td>
<td>Apify Proxy (Residential)</td>
</tr>
<tr>
<td><code>cookies</code></td>
<td>string</td>
<td>Optional raw Cookie header to include in requests.</td>
<td>Empty</td>
</tr>
<tr>
<td><code>cookiesJson</code></td>
<td>string</td>
<td>Optional cookies in JSON format.</td>
<td>Empty</td>
</tr>
<tr>
<td><code>dedupe</code></td>
<td>boolean</td>
<td>Remove duplicate agency URLs from results.</td>
<td>true</td>
</tr>
</tbody>
</table>

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
<td><code>rating</code></td>
<td>number</td>
<td>Average client rating (e.g., 4.8)</td>
</tr>
<tr>
<td><code>verified</code></td>
<td>string</td>
<td>Verification status (e.g., "Premier Verified")</td>
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
<td><code>location</code></td>
<td>string</td>
<td>Primary location</td>
</tr>
<tr>
<td><code>services</code></td>
<td>array</td>
<td>List of services offered</td>
</tr>
<tr>
<td><code>description</code></td>
<td>string</td>
<td>Agency description</td>
</tr>
<tr>
<td><code>url</code></td>
<td>string</td>
<td>Clutch.co profile URL</td>
</tr>
<tr>
<td><code>website</code></td>
<td>string</td>
<td>Agency website URL</td>
</tr>
</tbody>
</table>

### Sample Output

<pre><code>[
  {
    "name": "Power Digital",
    "rating": 4.8,
    "verified": "Premier Verified",
    "min_budget": "$5,000+",
    "hourly_rate": "$100 - $149 / hr",
    "company_size": "250 - 999",
    "location": "San Diego, CA",
    "services": ["Advertising", "Social Media Marketing", "Pay Per Click"],
    "description": "Power Digital is a tech-enabled growth firm...",
    "url": "https://clutch.co/profile/power-digital",
    "website": "https://powerdigitalmarketing.com"
  }
]</code></pre>

<p>You can download the dataset in JSON, CSV, or other formats from the Apify Console after the run completes.</p>

## Miscellaneous

<ul>
<li><strong>Limits and Performance</strong>: The Actor respects Clutch.co's terms of service and includes built-in delays to avoid overloading the site. For large datasets, consider running during off-peak hours.</li>
<li><strong>Data Freshness</strong>: Results reflect the current state of Clutch.co listings at the time of scraping.</li>
<li><strong>Support</strong>: For issues or questions, check the Actor's discussion forum on Apify or contact support.</li>
<li><strong>Updates</strong>: The Actor may be updated to handle changes in Clutch.co's website structure.</li>
</ul>

<p>This Actor is designed for ethical and legal use only. Always comply with Clutch.co's terms of service and applicable laws.</p>
