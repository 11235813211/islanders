import { Palette, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ClassicResource } from '../../../shared/types';
import { ArtDefs, CandyTile, NumberToken } from '../../art';
import { useCandyOptions } from '../../art/candy-options';
import './candy.css';

const TILES: { resource: ClassicResource; name: string }[] = [
  { resource: 'sheep', name: 'Sheep · cotton candy' },
  { resource: 'ore', name: 'Ore · kisses' },
  { resource: 'brick', name: 'Brick · Twizzlers' },
  { resource: 'wood', name: 'Wood · candy canes' },
  { resource: 'wheat', name: 'Wheat · gumdrops' },
];

/** Preview the five candy tiles and switch the editor between the Christmas and Christmas Candy looks. */
export default function CandyArtPicker() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const options = useCandyOptions();
  const uid = useId().replace(/:/g, '');
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  return (
    <>
      <button type="button" className="candy-art-open" aria-label="Candy art" onClick={() => setOpen(true)}>
        <Palette size={17} />
        <span>Candy art</span>
      </button>
      {open &&
        createPortal(
          <dialog
            ref={dialog}
            className="candy-art-dialog"
            aria-label="Christmas Candy art"
            onClose={() => setOpen(false)}
          >
            <header>
              <h2>Christmas Candy</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="Close candy art"
                onClick={() => dialog.current?.close()}
              >
                <X size={20} />
              </button>
            </header>
            <fieldset className="candy-look-buttons" aria-label="Preview look">
              <button
                type="button"
                aria-pressed={options.look === 'christmas'}
                onClick={() => options.setLook('christmas')}
              >
                Christmas
              </button>
              <button type="button" aria-pressed={options.look === 'candy'} onClick={() => options.setLook('candy')}>
                Christmas Candy
              </button>
            </fieldset>
            <div className="candy-art-grid">
              {TILES.map(({ resource, name }) => (
                <figure key={resource} className="candy-choice">
                  <svg viewBox="-65 -65 130 130" role="img" aria-label={name}>
                    <defs>
                      <ArtDefs uid={`${uid}-${resource}`} />
                    </defs>
                    <CandyTile uid={`${uid}-${resource}`} terrain={resource} />
                    <NumberToken uid={`${uid}-${resource}`} number={8} />
                  </svg>
                  <figcaption>{name}</figcaption>
                </figure>
              ))}
            </div>
          </dialog>,
          document.body,
        )}
    </>
  );
}
