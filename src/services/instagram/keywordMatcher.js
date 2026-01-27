class KeywordMatcher {
  constructor(keywords = []) {
    this.keywords = keywords.map(k => k.toLowerCase());
  }

  addKeyword(keyword) {
    const normalized = keyword.toLowerCase();
    if (!this.keywords.includes(normalized)) {
      this.keywords.push(normalized);
    }
  }

  removeKeyword(keyword) {
    const normalized = keyword.toLowerCase();
    this.keywords = this.keywords.filter(k => k !== normalized);
  }

  matches(text, options = {}) {
    const { caseSensitive = false, wholeWord = true } = options;
    
    const normalizedText = caseSensitive ? text : text.toLowerCase();
    
    for (const keyword of this.keywords) {
      const searchTerm = caseSensitive ? keyword : keyword.toLowerCase();
      
      if (wholeWord) {
        // Match whole word only
        const regex = new RegExp(`\\b${this.escapeRegex(searchTerm)}\\b`, 'i');
        if (regex.test(normalizedText)) {
          return { matched: true, keyword };
        }
      } else {
        // Match anywhere in text
        if (normalizedText.includes(searchTerm)) {
          return { matched: true, keyword };
        }
      }
    }
    
    return { matched: false, keyword: null };
  }

  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  filterComments(comments, options = {}) {
    const results = {
      matched: [],
      unmatched: []
    };

    comments.forEach(comment => {
      const match = this.matches(comment.text, options);
      
      if (match.matched) {
        results.matched.push({
          ...comment,
          detectedKeyword: match.keyword
        });
      } else {
        results.unmatched.push(comment);
      }
    });

    return results;
  }
}

module.exports = KeywordMatcher;