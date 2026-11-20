export function CookComplete() {
  return (
    <div className="cook-step cook-complete">
      <svg
        className="cook-complete-art"
        viewBox="0 0 280 210"
        aria-hidden="true"
      >
        <ellipse cx="140" cy="108" rx="103" ry="96" fill="#e3eee5" />
        <circle cx="140" cy="104" r="78" fill="#fff" />
        <circle
          cx="140"
          cy="104"
          r="64"
          fill="none"
          stroke="#d2dfd2"
          strokeWidth="2"
        />
        <circle cx="140" cy="104" r="52" fill="#f5f7f4" />
        <path d="M108 129c9-32 29-52 62-57-2 34-24 57-55 58" fill="#91b49a" />
        <path
          d="M111 130c15-13 29-28 43-42"
          fill="none"
          stroke="#256347"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path d="M136 107c-12-19-10-38 6-54 16 18 16 36-1 54" fill="#256347" />
        <path
          d="M33 55v36c0 10 16 10 16 0V55m-8 0v119m208-119v119m0-119c-18 21-19 46 0 50"
          fill="none"
          stroke="#596d5f"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="cook-complete-copy" role="status">
        <h3>Guten Appetit!</h3>
        <p>
          Dein Essen ist fertig.
          <br />
          Zeit zum Genießen.
        </p>
      </div>
    </div>
  );
}
