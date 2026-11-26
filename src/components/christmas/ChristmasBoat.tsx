/** The logo's boat at Christmas: a pine-green hull, a candy-striped sail, and a star on the mast. */
export default function ChristmasBoat({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="christmas-boat">
      <path d="M15.5 4v20" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M14.6 6.5 5 21h9.6Z" fill="#fff" />
      <path d="M14.6 9.4 11 14.8l3.6.1Zm0 7.5-6.2 1.5 6.2 1.1ZM9.9 16.7l4.7-4.1v1.8l-6.2 4.4Z" fill="#e2333b" />
      <path d="M17 8.5 25.5 21H17Z" fill="#e2333b" />
      <path d="M17 13.2 22.6 17.9 17 16.3ZM17 18.3l5.4 1.2-5.4-.2Z" fill="#fff" />
      <path d="M3 23h26l-3.6 5.2H6.6Z" fill="#2fa35a" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" />
      <circle cx="10" cy="25.6" r="1" fill="#ffd23f" />
      <circle cx="16" cy="25.6" r="1" fill="#e2333b" />
      <circle cx="22" cy="25.6" r="1" fill="#ffd23f" />
      <path d="m15.5 0 1 2.2 2.4.3-1.8 1.6.5 2.4-2.1-1.2-2.1 1.2.5-2.4-1.8-1.6 2.4-.3Z" fill="#ffd23f" />
    </svg>
  );
}
