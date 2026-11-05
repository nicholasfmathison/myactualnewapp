type IconName = 'arrow' | 'code' | 'spark' | 'check' | 'reset' | 'plus' | 'minus' | 'external';
const paths: Record<IconName, string> = {
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  code: 'm8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18',
  spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',
  check: 'm5 12 4 4L19 6',
  reset: 'M3 10a9 9 0 1 1 1 7M3 4v6h6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  external: 'M14 3h7v7m0-7L10 14m0-11H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5',
};
export function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
