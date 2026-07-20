# 菜谱海报底板生成 Prompt

```text
Use case: stylized-concept
Asset type: WeChat mini-program recipe poster background
Primary request: Create a polished 3:4 portrait background plate for a Chinese healthy-recipe sharing poster. The application will draw the recipe title, ingredients, cooking steps, nutrition highlights, and mini-program entry on top of this image later.
Scene/backdrop: quiet contemporary kitchen and dining visual language, with subtle natural food textures and restrained culinary details placed only around the outer edges.
Style/medium: premium editorial food illustration with lightly textured paper and clean modern composition; sophisticated rather than playful.
Composition/framing: 1080 x 1440 portrait. Keep the central 78% of the canvas calm, bright, low-contrast, and free of objects for dynamic text. Place any herbs, ceramic tableware, linen, or ingredient silhouettes near the top and bottom edges only. Keep all important decoration inside a center-safe crop that also works at 5:4 and 1:1.
Lighting/mood: fresh daylight, calm, trustworthy, appetizing.
Color palette: warm off-white, deep natural green, charcoal, and one restrained tomato-red accent. Avoid a one-color green palette.
Materials/textures: subtle uncoated paper grain, ceramic, linen, fresh herbs; no glossy advertising look.
Constraints: no text, no letters, no numbers, no logos, no watermark, no QR code, no people, no phone mockup, no UI controls. No large food dish in the central text area. No gradients, bokeh, floating blobs, or decorative cards. The background must remain readable when white and dark Chinese text is overlaid.
Avoid: busy ingredients, stock-photo appearance, dark moody lighting, beige-dominated palette, cartoon chef characters, Western restaurant branding.
```

建议输出 PNG，尺寸 `1080x1440`。生成后放入 `src/assets/recipe/recipe-poster-background.png`，再把该路径作为 `generateRecipePosterAssets` 的 `backgroundImage` 参数传入；不需要修改分享快照或落地页协议。
