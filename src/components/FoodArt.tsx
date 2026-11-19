import { useState } from "react";
import type { Recipe } from "../../shared/domain.ts";

export function FoodArt({
  recipe,
  index = 0,
}: {
  recipe: Recipe;
  index?: number;
}) {
  const [failedImage, setFailedImage] = useState("");
  const kind = recipe.title.toLowerCase();
  const pasta = kind.includes("pasta") || kind.includes("risotto");
  const bowl = kind.includes("dal") || kind.includes("bowl");
  if (
    recipe.image &&
    recipe.image !== failedImage &&
    /^https?:\/\//.test(recipe.image)
  )
    return (
      <img
        className="food-art"
        src={recipe.image}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailedImage(recipe.image)}
      />
    );
  return (
    <svg className="food-art" viewBox="0 0 240 144" aria-hidden="true">
      <rect
        width="240"
        height="144"
        fill={["#e9eee5", "#f0e8da", "#e8ece2"][index % 3]}
      />
      <ellipse cx="122" cy="117" rx="65" ry="9" fill="#000" opacity=".05" />
      <circle cx="120" cy="70" r="57" fill="#fafbf7" />
      <circle cx="120" cy="70" r="47" fill="#e1e3d7" />
      <circle
        cx="120"
        cy="70"
        r="43"
        fill={bowl ? "#c77e36" : pasta ? "#e6c778" : "#d8ba82"}
      />
      {Array.from({ length: 15 }, (_, i) => {
        const x = 120 + Math.cos(i * 2.4) * ((i % 4) * 9 + 8),
          y = 70 + Math.sin(i * 2.4) * ((i % 4) * 8 + 8);
        return pasta ? (
          <path
            key={i}
            d={`M${x - 8},${y - 3} q12,-12 17,1 t-13,7`}
            stroke="#f7df97"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
          />
        ) : (
          <rect
            key={i}
            x={x - 6}
            y={y - 6}
            width="12"
            height="12"
            rx="3"
            fill={i % 3 === 0 ? "#b95b38" : i % 3 === 1 ? "#f1dfaa" : "#789455"}
            transform={`rotate(${i * 27} ${x} ${y})`}
          />
        );
      })}
      {[0, 1, 2, 3, 4].map((i) => (
        <ellipse
          key={i}
          cx={96 + i * 12}
          cy={53 + (i % 2) * 27}
          rx="5"
          ry="10"
          fill="#436d3f"
          transform={`rotate(${30 + i * 32} ${96 + i * 12} ${53 + (i % 2) * 27})`}
        />
      ))}
      <path
        d="M180 24v92m-6-92v24q6 8 12 0V24"
        stroke="#a6aea0"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
