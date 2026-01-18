class BacklinksManager {
  constructor() {
    this.cacheKey = 'quartz-backlinks-cache';
    this.cacheDuration = 5 * 60 * 1000; // 5 minutes
  }
  
  async getSearchData() {
    // Check cache first
    const cached = this.getCachedData();
    if (cached) return cached;
    const response = await fetch('/search.json');
    if (!response.ok) throw new Error('Failed to load search.json');
    const data = await response.json();

    // Detect format: optimized (has links), pages array, or wrapper with pages
    if (data && data.links) {
      const result = { type: 'optimized', links: data.links, stats: data.stats || {} };
      this.cacheData(result);
      return result;
    }

    if (Array.isArray(data)) {
      const result = { type: 'legacy', pages: data };
      this.cacheData(result);
      return result;
    }

    if (data && data.pages && Array.isArray(data.pages)) {
      const result = { type: 'legacy', pages: data.pages };
      this.cacheData(result);
      return result;
    }

    throw new Error('Unknown search.json format');
  }
  
  getCachedData() {
    try {
      const cached = localStorage.getItem(this.cacheKey);
      if (!cached) return null;
      
      const { timestamp, data } = JSON.parse(cached);
      if (Date.now() - timestamp < this.cacheDuration) {
        return data;
      }
    } catch (e) {
      console.warn('Cache read failed:', e);
    }
    return null;
  }
  
  cacheData(data) {
    try {
      const cache = {
        timestamp: Date.now(),
        data: data
      };
      localStorage.setItem(this.cacheKey, JSON.stringify(cache));
    } catch (e) {
      console.warn('Cache write failed:', e);
    }
  }
  
  findBacklinks(pages, currentPath) {
    if (!pages) return [];
    if (!Array.isArray(pages)) return [];

    return pages.filter(page => {
      // Skip current page
      if (!page || !page.url) return false;
      if (page.url === currentPath) return false;

      // Look for markdown links to current page
      const patterns = [
        new RegExp(`\\[[^\\]]*\\]\\(${this.escapeRegex(currentPath)}\\)`, 'i'),
        new RegExp(`\\[[^\\]]*\\]\\(${this.escapeRegex(currentPath)}[^)]*\\)`, 'i')
      ];

      return patterns.some(pattern => pattern.test(String(page.content || '')));
    });
  }

  normalizeUrl(url) {
    if (!url) return '';
    // Remove protocol/host if present
    try {
      const u = new URL(url, window.location.origin);
      url = u.pathname + (u.hash || '');
    } catch (e) {
      // ignore
    }
    // Remove trailing slash except root
    if (url !== '/' && url.endsWith('/')) url = url.slice(0, -1);
    // Remove /index or index.html
    url = url.replace(/\/index(\.html)?$/, '');
    return url === '' ? '/' : url;
  }
  
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  async render(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Loading backlinks...</div>';
    
    try {
      const data = await this.getSearchData();
      const currentPath = window.location.pathname;

      let backlinks = [];

      if (data && data.type === 'optimized') {
        const key = this.normalizeUrl(currentPath);
        backlinks = (data.links && data.links[key]) ? data.links[key] : [];
      } else if (data && data.type === 'legacy') {
        backlinks = this.findBacklinks(data.pages || [], currentPath);
      }

      if (backlinks && backlinks.length > 0) {
        container.innerHTML = `
          <div class="backlinks-header">
            <h4>Cited in</h4>
          </div>
          <div class="backlinks-list">
            ${backlinks.map(item => this.renderPageCard(item)).join('')}
          </div>
        `;
      } else {
        container.innerHTML = '<div class="empty">No backlinks found.</div>';
      }
    } catch (error) {
      container.innerHTML = `<div class="error">Failed to load backlinks.</div>`;
      console.error('Backlinks error:', error);
    }
  }
  
  renderPageCard(page) {
    return `
      <a href="${page.url}" class="backlink-card">
        <div class="backlink-title">${page.title}</div>
        ${page.date ? `<div class="backlink-date">${page.date}</div>` : ''}
      </a>
    `;
  }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
  const backlinks = new BacklinksManager();
  backlinks.render('backlinks-container');
});