// Card faces at Christmas: a cap of snow along the top and a sprig of holly in the corner,
// laid over the usual resource art (positioned by .cards-decor in christmas-theme.css).
import { CHRISTMAS } from './tuning';

/** Snow and holly over a resource card's face. */
export function CardDecor() {
  const { holly, berry, snow } = CHRISTMAS.cards;
  return (
    <>
      <svg className="cards-decor cards-snowcap" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true">
        <path
          d="M0 0H100V5Q94 9 88 5.5Q82 10 75 5.5Q68 9.5 60 5Q53 10 45 5.5Q38 9 30 5Q23 10 15 5.5Q8 9.5 0 5Z"
          fill={snow}
        />
      </svg>
      <svg className="cards-decor cards-holly" viewBox="0 0 30 24" aria-hidden="true">
        <path d="M15 12C10 4 4 6 2 3c2 5-1 6 1 9 3-1 5 2 12 0Z" fill={holly} />
        <path d="M15 12c5-8 11-6 13-9-2 5 1 6-1 9-3-1-5 2-12 0Z" fill={holly} />
        <path d="M15 12C9 5 4 7 2 3m13 9c6-7 11-5 13-9" stroke="#0f4d23" strokeWidth=".7" fill="none" />
        <circle cx="13" cy="14.5" r="2.6" fill={berry} />
        <circle cx="17.4" cy="14" r="2.6" fill={berry} />
        <circle cx="15.2" cy="17.6" r="2.6" fill={berry} />
        <circle cx="12.3" cy="13.6" r=".8" fill="#fff" opacity=".7" />
      </svg>
    </>
  );
}
