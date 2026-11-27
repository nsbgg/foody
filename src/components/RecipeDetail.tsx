import {
  CookingPot,
  CalendarDays,
  Pencil,
  Archive,
  Share2,
} from "lucide-react";
import { useState } from "react";
import { recipeImages } from "../../shared/recipe-image.ts";
import { formatAmount } from "../../shared/domain.ts";
import type { RecipeRow, EntryRow } from "../types.ts";
import { FoodArt } from "./FoodArt.tsx";

export function RecipeDetail({
  row,
  onEdit,
  onPlan,
  onCook,
  onArchive,
  onShare,
}: {
  row: RecipeRow | EntryRow;
  onEdit?: () => void;
  onPlan: () => void;
  onCook: () => void;
  onArchive?: () => void;
  onShare?: () => void;
}) {
  const entry = row.kind === "entry" ? (row as EntryRow) : undefined;
  const r = entry ? entry.data.recipe : (row as RecipeRow).data;
  const servings = entry ? entry.data.servings : r.servings;
  const images = recipeImages(r);
  const [selectedImage, setSelectedImage] = useState("");
  const currentImage = images.includes(selectedImage)
    ? selectedImage
    : images[0] || r.image;
  return (
    <>
      <FoodArt recipe={{ ...r, image: currentImage }} />
      {images.length > 1 && (
        <div className="recipe-gallery" role="group" aria-label="Rezeptbilder">
          {images.map((image, index) => (
            <button
              type="button"
              key={image}
              aria-label={`Bild ${index + 1} anzeigen`}
              aria-pressed={currentImage === image}
              onClick={() => setSelectedImage(image)}
            >
              <img
                src={image}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            </button>
          ))}
        </div>
      )}
      <span className="recipe-context">
        {r.category} · {r.minutes} Minuten · {servings} Portionen
      </span>
      <h2>{r.title}</h2>
      <p>{r.description}</p>
      <div className="detail-actions">
        {onShare && (
          <button className="secondary" onClick={onShare}>
            <Share2 size={17} />
            Teilen
          </button>
        )}
        <button className="primary" onClick={onCook}>
          <CookingPot size={17} />
          Kochen
        </button>
        <button className="secondary" onClick={onPlan}>
          <CalendarDays size={17} />
          {entry ? "Plan ändern" : "Einplanen"}
        </button>
        {onEdit && (
          <button className="text-button" onClick={onEdit}>
            <Pencil size={16} />
            {entry ? "Original bearbeiten" : "Bearbeiten"}
          </button>
        )}
      </div>
      <h3>Zutaten</h3>
      <ul className="ingredient-list">
        {r.ingredients.map((i, n) => (
          <li key={n}>
            <span>{i.name}</span>
            <strong>
              {formatAmount(
                i.amount === null ? null : (i.amount * servings) / r.servings,
                i.unit,
              )}
            </strong>
          </li>
        ))}
      </ul>
      <h3>Zubereitung</h3>
      <ol className="recipe-steps">
        {r.steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      {/^https?:\/\//.test(r.source) && (
        <a href={r.source} target="_blank" rel="noreferrer">
          Originalrezept öffnen
        </a>
      )}
      {onArchive && (
        <div className="archive-row">
          <button className="text-button" onClick={onArchive}>
            <Archive size={16} />
            {r.archived ? "Wiederherstellen" : "Gericht archivieren"}
          </button>
        </div>
      )}
    </>
  );
}
