// ================================================================
//  core/signature.js — Turning a photographed signature into one
//                      that can sit on a document. (v13)
//
//  THE PROBLEM. A signature is signed on paper and photographed. That
//  photo is a white rectangle with some ink in it. Dropped onto a
//  report it covers whatever is underneath — a signature line, a table
//  border — with a white box, and it looks pasted on, because it is.
//
//  WHAT THIS DOES. Removes the paper and keeps the ink: every pixel
//  bright enough to be paper becomes transparent, and what remains is
//  cropped to the ink and darkened so a grey phone photo prints black.
//
//  ── WHY THRESHOLD AND NOT SOMETHING CLEVERER ─────────────────
//
//  A brightness threshold is crude. It is also the only approach that
//  behaves predictably on a photo taken on a site office desk with a
//  window on one side — anything adaptive produces a different result
//  each time and gives a person no way to understand what went wrong.
//  When it fails here, it fails visibly and the fix is obvious: better
//  light, or move the threshold slider.
//
//  Everything runs IN THE BROWSER, on a canvas. Nothing is uploaded
//  until the person can see the result, so a bad photo is discarded
//  before it becomes a record rather than after.
// ================================================================

const Signature = {

    /** Pixels brighter than this are treated as paper. */
    DEFAULT_THRESHOLD: 200,

    /**
     * process - file in, transparent PNG data URL out.
     *
     * @param file        the uploaded image
     * @param threshold   0-255; higher keeps more of the faint strokes
     * @returns { dataUrl, width, height, inkPixels }
     */
    async process(file, threshold) {
        const t = threshold === undefined ? this.DEFAULT_THRESHOLD : threshold;
        const img = await this._load(file);

        // A signature never needs to be huge, and a 12-megapixel phone
        // photo makes every document that carries it slow to open.
        const MAX_W = 900;
        const scale = img.width > MAX_W ? MAX_W / img.width : 1;
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);

        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);

        const data = ctx.getImageData(0, 0, w, h);
        const px = data.data;

        let minX = w, minY = h, maxX = -1, maxY = -1, ink = 0;

        for (let i = 0; i < px.length; i += 4) {
            // Perceptual brightness, not a plain average: blue ink on
            // white reads far darker to the eye than its average
            // suggests, and averaging loses it at the same threshold
            // that keeps black ink.
            const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];

            if (lum >= t) {
                px[i + 3] = 0;                     // paper → transparent
                continue;
            }

            // Ink. Darken it towards black so a grey phone photo still
            // prints as a signature rather than a smudge, and fade the
            // edge pixels so the stroke does not come out jagged.
            const strength = 1 - (lum / t);        // 0 at the threshold, 1 at pure black
            px[i] = px[i + 1] = px[i + 2] = 0;
            px[i + 3] = Math.round(255 * Math.min(1, strength * 1.6));

            if (px[i + 3] > 40) {
                ink++;
                const p = i / 4;
                const x = p % w, y = (p / w) | 0;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }

        ctx.putImageData(data, 0, 0);

        // Nothing dark enough to be ink. Say so rather than returning a
        // blank image that only fails later, on a printed document.
        if (maxX < 0) {
            throw new Error('No signature found in that image. It may be too faint, ' +
                'or the photo too bright — try again with more even light.');
        }

        // Crop to the ink with a small margin. Without this the
        // signature inherits however much desk was in the photo, and two
        // signatures on one page come out at wildly different sizes.
        const pad = 8;
        const cx = Math.max(0, minX - pad);
        const cy = Math.max(0, minY - pad);
        const cw = Math.min(w, maxX + pad) - cx;
        const ch = Math.min(h, maxY + pad) - cy;

        const out = document.createElement('canvas');
        out.width = cw; out.height = ch;
        out.getContext('2d').drawImage(c, cx, cy, cw, ch, 0, 0, cw, ch);

        return {
            dataUrl: out.toDataURL('image/png'),   // PNG: JPEG has no transparency
            width: cw, height: ch, inkPixels: ink
        };
    },

    _load(file) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = e => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error('That file could not be read as an image.'));
                img.src = e.target.result;
            };
            r.onerror = () => reject(new Error('That file could not be read.'));
            r.readAsDataURL(file);
        });
    },

    /**
     * dataUrlToBase64 - strips the prefix for the upload endpoint,
     * which expects raw base64.
     */
    dataUrlToBase64(dataUrl) {
        return String(dataUrl || '').split(',')[1] || '';
    }
};
