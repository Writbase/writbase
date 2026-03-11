const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const relativeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function formatDate(dateStr: string): string {
  return dateFormatter.format(new Date(dateStr));
}

export function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const diffMs = now - new Date(dateStr).getTime();
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 60) return 'just now';

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return relativeFormatter.format(-diffMinutes, 'minute');

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return relativeFormatter.format(-diffHours, 'hour');

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return relativeFormatter.format(-diffDays, 'day');

  return formatDate(dateStr);
}

export function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays >= -7 && diffDays <= 7) {
    return relativeFormatter.format(diffDays, 'day');
  }

  return formatDate(dateStr);
}
