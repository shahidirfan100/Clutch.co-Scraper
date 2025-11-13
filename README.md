# Clutch.co Agencies Scraper

> **Extract comprehensive agency data from Clutch.co** - The world's leading B2B service provider directory. Perfect for market research, lead generation, and competitive analysis.

[![Apify Actor](https://img.shields.io/badge/Apify-Actor-blue)](https://apify.com)
[![Data Extraction](https://img.shields.io/badge/Data-Clutch.co-green)](https://clutch.co)
[![B2B Services](https://img.shields.io/badge/Category-B2B%20Services-orange)](https://clutch.co)

## 📋 Overview

This powerful scraper extracts detailed information about B2B service agencies from Clutch.co, the premier directory for business service providers. Whether you're conducting market research, generating leads, or analyzing competitors, this tool provides comprehensive agency data including ratings, services, pricing, and contact information.

### ✨ Key Features

- **📊 Comprehensive Data Extraction**: Collect ratings, reviews, services, pricing, and contact details
- **🎯 Smart Filtering**: Filter by category, location, and custom criteria
- **📄 Deep Profile Scraping**: Optional detailed profile visits for complete agency information
- **🔄 Automatic Pagination**: Handles multiple pages seamlessly
- **🛡️ Anti-Blocking Technology**: Built-in stealth features for reliable scraping
- **⚡ High Performance**: Optimized for speed with configurable concurrency
- **📈 Scalable Results**: Collect hundreds or thousands of agency profiles

### 🎯 Perfect For

- **Market Research Analysts** - Analyze B2B service trends and pricing
- **Lead Generation Teams** - Build targeted lists of qualified agencies
- **Competitive Intelligence** - Compare agency offerings and client feedback
- **Business Development** - Identify partnership opportunities
- **Data Analysts** - Gather structured B2B service provider data

## 🚀 Quick Start

### Basic Usage

```json
{
  "category": "mobile-app-development",
  "location": "New York",
  "results_wanted": 100
}
```

### Advanced Configuration

```json
{
  "category": "web-development",
  "location": "San Francisco",
  "results_wanted": 500,
  "collectDetails": true,
  "maxConcurrency": 3
}
```

## 📥 Input Parameters

| Parameter | Type | Description | Default | Required |
|-----------|------|-------------|---------|----------|
| `category` | string | Agency category filter (e.g., "mobile-app-development", "web-design") | - | No |
| `location` | string | Geographic filter (e.g., "New York", "London", "Toronto") | - | No |
| `startUrls` | array | Custom starting URLs for specific listings | Auto-generated | No |
| `startUrl` | string | Single starting URL (alternative to startUrls) | - | No |
| `results_wanted` | integer | Maximum agencies to collect (0 = unlimited) | 100 | No |
| `max_pages` | integer | Maximum listing pages to process | 25 | No |
| `collectDetails` | boolean | Visit individual profiles for full data | true | No |
| `proxyConfiguration` | object | Proxy settings for scraping | Residential proxy | No |
| `maxConcurrency` | integer | Concurrent requests (1-10 recommended) | 4 | No |
| `debugLog` | boolean | Enable detailed logging | false | No |

### 📍 Category Examples

- `mobile-app-development` - Mobile App Development Agencies
- `web-development` - Web Development Companies
- `digital-marketing` - Digital Marketing Agencies
- `software-development` - Software Development Firms
- `ui-ux-design` - UI/UX Design Agencies

### 🌍 Location Examples

- `New York` - New York City agencies
- `London` - London-based companies
- `San Francisco` - Bay Area providers
- `Toronto` - Toronto agencies
- `Sydney` - Australian companies

## 📤 Output Data

Each agency record contains comprehensive information in structured JSON format:

### Core Information
- **Basic Details**: Name, profile URL, company size, locations
- **Ratings & Reviews**: Average rating, review count, verification status
- **Pricing**: Minimum budget, hourly rates, project size ranges

### Services & Expertise
- **Services Offered**: Detailed service list with focus areas
- **Industries Served**: Target markets and industry specializations
- **Awards & Recognition**: Certifications and achievements

### Contact Information
- **Website**: Official company website
- **Contact Details**: Phone, email, address
- **Social Presence**: LinkedIn, social media links

### Sample Output Record

```json
{
  "name": "Tech Solutions Inc",
  "url": "https://clutch.co/profile/tech-solutions-inc",
  "rating": 4.9,
  "review_count": 156,
  "verified": "Premier Verified",
  "min_budget": "$25,000+",
  "hourly_rate": "$100 - $149 / hr",
  "company_size": "50 - 249",
  "primary_location": "San Francisco, CA",
  "locations": ["San Francisco, CA", "Austin, TX"],
  "services": [
    "Mobile App Development 40%",
    "Web Development 35%",
    "UX/UI Design 25%"
  ],
  "industries": [
    "Technology",
    "Healthcare",
    "Financial Services"
  ],
  "description": "Leading digital transformation agency specializing in mobile and web solutions...",
  "website": "https://techsolutions.com",
  "phone": "+1 (555) 123-4567",
  "email": "contact@techsolutions.com",
  "year_founded": "2015",
  "languages": "3",
  "timezones": "2",
  "fetched_at": "2025-11-12T10:30:00.000Z"
}
```

## 🎯 Usage Examples

### Example 1: Basic Lead Generation

**Goal**: Collect 50 mobile app development agencies in New York

```json
{
  "category": "mobile-app-development",
  "location": "New York",
  "results_wanted": 50,
  "collectDetails": true
}
```

### Example 2: Market Research

**Goal**: Analyze web development agencies globally

```json
{
  "category": "web-development",
  "results_wanted": 200,
  "maxConcurrency": 2
}
```

### Example 3: Competitive Analysis

**Goal**: Deep dive into specific agency profiles

```json
{
  "startUrls": [
    "https://clutch.co/directory/web-development",
    "https://clutch.co/directory/mobile-app-development"
  ],
  "results_wanted": 100,
  "collectDetails": true,
  "debugLog": true
}
```

### Example 4: Custom URL Scraping

**Goal**: Scrape from specific Clutch.co listing pages

```json
{
  "startUrl": "https://clutch.co/directory/digital-marketing/new-york",
  "results_wanted": 75
}
```

## ⚙️ Configuration Guide

### Performance Tuning

**For Speed** (Higher risk of blocking):
```json
{
  "maxConcurrency": 8,
  "max_pages": 50
}
```

**For Stealth** (Slower but more reliable):
```json
{
  "maxConcurrency": 2,
  "max_pages": 10
}
```

### Proxy Configuration

The actor automatically uses residential proxies for best results. For custom proxy setup:

```json
{
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"]
  }
}
```

### Data Collection Options

**Basic Data Only** (Faster):
```json
{
  "collectDetails": false,
  "results_wanted": 1000
}
```

**Complete Profiles** (Slower but comprehensive):
```json
{
  "collectDetails": true,
  "results_wanted": 100
}
```

## 📊 Output Formats

Results are available in multiple formats:

- **JSON**: Full structured data
- **CSV**: Spreadsheet-compatible format
- **XML**: For system integration
- **RSS**: For feed consumption

Access your data through the Apify Console or API after the run completes.

## 🔧 API Integration

### REST API Usage

```bash
curl -X POST "https://api.apify.com/v2/acts/YOUR_ACTOR_ID/runs" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "category": "mobile-app-development",
    "location": "San Francisco",
    "results_wanted": 50
  }'
```

### Webhook Integration

Set up webhooks to receive notifications when your scraping job completes:

```json
{
  "webhookUrl": "https://your-app.com/webhook",
  "webhookHeaders": {
    "Authorization": "Bearer YOUR_WEBHOOK_TOKEN"
  }
}
```

## 📈 Limits & Performance

### Rate Limits
- **Concurrent Requests**: 1-10 (recommended: 2-5)
- **Daily Capacity**: Depends on proxy configuration
- **Request Timeout**: 60 seconds per page

### Performance Tips
- Use residential proxies for best success rates
- Lower concurrency reduces blocking risk
- Enable debug logging to monitor performance
- Set reasonable `results_wanted` limits

### Data Freshness
- Results reflect current Clutch.co data at scrape time
- Re-run periodically for updated information
- Historical data available in Apify storage

## 🛡️ Reliability Features

- **Anti-Blocking Technology**: Advanced stealth techniques
- **Session Management**: Automatic session rotation
- **Error Recovery**: Built-in retry mechanisms
- **Data Validation**: Comprehensive result validation
- **Monitoring**: Real-time progress tracking

## 📞 Support & Resources

### Getting Help

- **Documentation**: Complete API reference and guides
- **Community Forum**: Connect with other users
- **Issue Tracking**: Report bugs and request features
- **Live Chat**: Direct support for Apify customers

### Best Practices

1. **Start Small**: Test with small result sets first
2. **Use Filters**: Narrow searches for better results
3. **Monitor Usage**: Track API usage and costs
4. **Respect Limits**: Adhere to rate limits and terms
5. **Data Quality**: Validate results before production use

## 📄 License & Terms

This actor is designed for ethical and legal use only. Always comply with Clutch.co's terms of service and applicable data protection laws.

---

**Built for Apify Platform** | **Trusted by 1M+ Users** | **Enterprise-Ready**
