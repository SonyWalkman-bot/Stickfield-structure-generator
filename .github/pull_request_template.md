## What changes for someone using Weavefield

<!-- One or two sentences, in the words a user would use. Screenshots for anything visible. -->

## How it was checked

- [ ] `npm run build` and `npm test` pass
- [ ] UI change: `npm run test:smoke` passes and I looked at the screenshots in `test/out/`
- [ ] Physics change: `node test/t_phys.js` still matches beam theory, and I said why any number moved
- [ ] The offline copy still works with no network (`npm run test:offline`) if the build, saving or loading changed
- [ ] Light and dark mode, and a phone-width window, if layout changed
