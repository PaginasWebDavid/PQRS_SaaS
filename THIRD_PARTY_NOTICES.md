# Third-Party Notices

The project's MIT license applies to its own code. Third-party components and assets retain their respective licenses. This inventory is a starting point, not a complete dependency license audit.

## Bundled fonts

- `src/app/fonts/GeistVF.woff` and `GeistMonoVF.woff` identify themselves as Geist and Geist Mono version 1.200. Their font metadata names Basement.studio and Vercel among the creators. They entered this repository in its initial Create Next App commit. The exact upstream binary or release used has not been verified. The [Geist project](https://github.com/vercel/geist-font) publishes its fonts under the SIL Open Font License 1.1; the upstream notice is reproduced in [OFL-Geist.txt](src/app/fonts/OFL-Geist.txt).
- Manrope and JetBrains Mono are loaded through `next/font/google`; the recovery page also references Google Fonts. Their upstream projects publish them under SIL Open Font License 1.1: [Manrope](https://github.com/google/fonts/blob/main/ofl/manrope/OFL.txt) and [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono/blob/master/OFL.txt). Distribution of generated font files should preserve the applicable notices.

## Icons and dependencies

- `lucide-react` is an installed dependency. Its package includes the ISC license and copyright notices for Lucide contributors and portions derived from Feather. See the package's `LICENSE` and the [upstream license](https://github.com/lucide-icons/lucide/blob/main/LICENSE).
- The installed `busboy` and `streamsearch` packages include MIT license files. Refer to each package's own copyright and license notice when redistributing it.
- The installed `buffers` 0.1.1 package does not declare a license in its package metadata or include a license file. Its precise license and permission to redistribute remain unverified; do not infer a license from the project's MIT license.
- Other direct and transitive dependencies are listed in `package-lock.json`. Their own license files and notices must be reviewed for each distribution; platform-specific packages absent from a local installation are not covered by the checks above.

## Project assets requiring provenance review

`public/logo.svg`, `src/app/icon.svg`, `public/marketing/hero-product-preview.png`, and the logo, icon, images and screenshots under `pqrs-services-design-handoff/` are project assets. The handoff describes the screenshots as synthetic demonstration data, and the project owner has confirmed that some demo data was generated with AI assistance. The exact source and redistribution rights for each logo and image have not been independently documented; confirm the original design exports, authorship, and applicable terms before claiming a specific third-party license.
