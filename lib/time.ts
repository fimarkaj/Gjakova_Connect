export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Sapo dërguar";
  if (minutes < 60) return `${minutes} minuta më parë`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} orë më parë`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ditë më parë`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} muaj më parë`;
  const years = Math.floor(months / 12);
  return `${years} vite më parë`;
}
