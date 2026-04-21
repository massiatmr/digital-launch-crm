const VALID_ICONS = new Set([
  'AlertTriangle', 'AlertCircle', 'Clock', 'TrendingDown', 'Frown', 'Zap',
  'Rocket', 'Target', 'Gift', 'Shield', 'Star', 'Trophy', 'Gem', 'Sparkles', 'Check',
]);

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export const hasOfferText = (value: unknown) => text(value).length > 0;

export function normalizeOfferItem(item: any, type?: string) {
  if (typeof item === 'string') return text(item) || null;
  if (!item || typeof item !== 'object') return null;

  if (type === 'faq') {
    const question = text(item.question);
    const answer = text(item.answer);
    return question && answer ? { ...item, question, answer } : null;
  }

  const title = text(item.title);
  const description = text(item.description);
  const value = text(item.value);
  const icon = VALID_ICONS.has(text(item.icon)) ? text(item.icon) : type === 'bonuses' ? 'Gift' : 'Check';

  if (!title && !description) return null;
  return { ...item, icon, title, description, ...(value ? { value } : {}) };
}

export function getVisibleOfferItems(section: any) {
  if (!section || !Array.isArray(section.items)) return [];
  return section.items
    .map((item: any) => normalizeOfferItem(item, section.type))
    .filter(Boolean);
}

export function sanitizeOfferSections(sections: any[]) {
  if (!Array.isArray(sections)) return [];
  return sections.map((section) => {
    if (!section || typeof section !== 'object') return section;
    if (Array.isArray(section.items)) {
      return { ...section, items: getVisibleOfferItems(section) };
    }
    return section;
  }).filter((section) => {
    if (!section || typeof section !== 'object') return false;
    if (['pain_points', 'deliverables', 'bonuses', 'faq', 'portfolio'].includes(section.type)) {
      return getVisibleOfferItems(section).length > 0;
    }
    if (section.type === 'transformation') return hasOfferText(section.before) || hasOfferText(section.after);
    if (section.type === 'guarantee') return hasOfferText(section.title) || hasOfferText(section.description);
    if (section.type === 'solution') return hasOfferText(section.title) || hasOfferText(section.description) || getVisibleOfferItems(section).length > 0;
    if (section.type === 'pricing') return hasOfferText(section.anchor) || hasOfferText(section.final);
    return true;
  });
}

export function sanitizeOfferPageContent<T extends { sections?: any[]; testimonials?: any[] }>(page: T): T {
  return {
    ...page,
    sections: sanitizeOfferSections(Array.isArray(page.sections) ? page.sections : []),
    testimonials: Array.isArray(page.testimonials) ? page.testimonials : [],
  };
}