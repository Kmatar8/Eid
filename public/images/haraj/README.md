# Haraj Product Images

Drop Haraj product images in this folder.

- Required path pattern in app: `/images/haraj/<filename>`
- Source of filenames: `haraj.csv` column `image`
- Sync script auto-resolves extension mismatches when basename matches existing files (e.g., `image.jpg` -> `image.jpeg`).
- Preferred runtime asset when multiple extensions exist is `.webp`.
- After editing `haraj.csv`, regenerate product bank:

```bash
npm run sync:haraj:csv
```

To optimize images and regenerate product bank in one command:

```bash
npm run assets:haraj:sync
```

Expected filenames from current CSV:

1. `iphone.jpg`
2. `chanel.jpg`
3. `snickers.jpg`
4. `vasline.jpg`
5. `ps5.jpg`
6. `camry.jpg`
7. `indome.jpg`
8. `hilal.jpg`
9. `airpods.jpg`
10. `romance.jpg`
11. `shein.jpg`
12. `toy.jpg`
