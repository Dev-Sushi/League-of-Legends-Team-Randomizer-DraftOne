# Images Directory

This directory contains all images used by the League of Legends Team Randomizer.

## Required Images

### Banner
- **File**: `banner.svg`
- **Description**: Main banner image displayed at the top of the page
- **Recommended size**: Scalable (SVG), max display height 80px

### Favicon
- **File**: `favicon.png`
- **Description**: Browser tab icon
- **Recommended size**: 32x32px or 64x64px

### Role Icons (`/roles/` subdirectory)
Place the following role icon images in the `images/roles/` directory:

1. **`top.png`** - Top lane icon
2. **`jungle.png`** - Jungle role icon
3. **`mid.png`** - Mid lane icon
4. **`adc.png`** - ADC/Bot lane icon
5. **`support.png`** - Support role icon

**Recommended specifications for role icons:**
- Format: PNG with transparency
- Size: 64x64px (will be displayed at 24x24px)
- Style: Match League of Legends visual theme

## Directory Structure

```
images/
├── README.md
├── banner.svg
├── favicon.png
└── roles/
    ├── top.png
    ├── jungle.png
    ├── mid.png
    ├── adc.png
    └── support.png
```

## Notes

- All images are referenced using relative paths from the CSS and HTML files
- Role icons use CSS background-image properties
- Images should be optimized for web use to minimize loading times
- Consider using League of Legends official assets or creating custom icons that match the theme
