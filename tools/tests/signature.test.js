/**
 * signature.test.js — Turning a photo of a signature into one that can
 * sit ON a signature line instead of covering it with a white box.
 *
 * The canvas is stubbed: what matters is the pixel maths, and a real
 * canvas would only be testing the browser.
 */

const fs = require('fs');
const path = require('path');

module.exports = function (t) {

    const W = 40, H = 20;
    const makeImage = paint => {
        const px = new Uint8ClampedArray(W * H * 4);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4, v = paint(x, y);
            px[i] = v[0]; px[i + 1] = v[1]; px[i + 2] = v[2]; px[i + 3] = 255;
        }
        return px;
    };
    const INK = () => makeImage((x, y) =>
        (x >= 15 && x <= 24 && y >= 6 && y <= 13) ? [30, 30, 30] : [252, 252, 250]);

    let SRC = INK(), WORK = null;
    const document = {
        createElement: () => {
            const c = {
                width: 0, height: 0, _px: null,
                getContext: () => ({
                    drawImage() { if (!c._px) { c._px = SRC.slice(); if (!WORK) WORK = c; } },
                    getImageData: () => ({ data: c._px, width: c.width, height: c.height }),
                    putImageData(d) { c._px = d.data; }
                }),
                toDataURL: () => 'data:image/png;base64,STUB'
            };
            return c;
        }
    };

    const S = new Function('document', 'Image', 'FileReader',
        fs.readFileSync(path.join(t.ROOT, 'js/core/signature.js'), 'utf8') + '\nreturn Signature;')
        (document, function () {}, function () {});
    S._load = async () => ({ width: W, height: H });

    // The runner awaits a promise returned from the module, so the
    // async work is done first and every assertion below is synchronous.
    let r = null, blankErr = null, faintErr = null, r2 = null, px = null;
    return (async () => {
        WORK = null; SRC = INK();
        r = await S.process(null, 200);
        px = WORK._px;

        WORK = null; SRC = makeImage(() => [255, 255, 255]);
        try { await S.process(null, 200); } catch (e) { blankErr = e; }

        WORK = null;
        SRC = makeImage((x, y) => (x >= 15 && x <= 24 && y >= 6 && y <= 13) ? [190, 190, 190] : [252, 252, 250]);
        try { await S.process(null, 150); } catch (e) { faintErr = e; }
        WORK = null;
        r2 = await S.process(null, 230);

    t.describe('signature background removal', () => {
        t.it('ink is detected', () => t.ok(r && r.inkPixels > 0, 'no ink found in a page with a stroke on it'));
        t.it('the result is cropped to the ink', () => t.ok(r.width < W,
            'a signature that keeps the whole photo comes out a different size to every other one'));
        t.it('the output is PNG', () => t.ok(r.dataUrl.indexOf('data:image/png') === 0,
            'JPEG has no transparency, which is the entire point'));

        t.it('paper becomes transparent', () => {
            let clear = 0;
            for (let i = 0; i < px.length; i += 4) if (px[i + 3] === 0) clear++;
            t.ok(clear > 0, 'the white box is still there — it would cover the signature line');
        });
        t.it('ink stays opaque', () => {
            let opaque = 0;
            for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 200) opaque++;
            t.ok(opaque > 0, 'the strokes were erased along with the paper');
        });
        t.it('ink is darkened to black', () => {
            let grey = 0;
            for (let i = 0; i < px.length; i += 4) {
                if (px[i + 3] > 200 && (px[i] || px[i + 1] || px[i + 2])) grey++;
            }
            t.ok(grey === 0, 'a grey phone photo would print as a smudge');
        });

        t.it('a blank page is rejected with a usable message', () => {
            t.ok(blankErr && /No signature found/.test(blankErr.message),
                'a blank image would only fail later, on a printed document');
        });
        t.it('faint ink below the threshold is rejected', () => t.ok(!!faintErr,
            'the threshold slider would have no purpose otherwise'));
        t.it('and the same faint ink is kept at a higher threshold', () =>
            t.ok(r2 && r2.inkPixels > 0));

        t.it('base64 is stripped for upload', () =>
            t.eq(S.dataUrlToBase64('data:image/png;base64,ABC'), 'ABC'));
        t.it('an empty data url does not throw', () =>
            t.eq(S.dataUrlToBase64(''), ''));
    });
    })();
};
