# 默认头像生成提示词

两张头像必须使用同一模型、同一质量档位生成，保证成对使用时的构图、材质和光线一致。建议输出 `1024x1024` PNG，生成后再压缩为应用资源。

## 男性默认头像

```text
Use case: stylized-concept
Asset type: default profile avatar for a premium nutrition and health-management mobile app
Primary request: create a refined, minimal male default avatar for an adult user
Subject: friendly East Asian adult man, about 30-40 years old, natural short dark hair, calm warm expression, understated light sage overshirt over an off-white crew-neck top
Style/medium: premium editorial 3D illustration with subtle soft realism; clean contemporary social-media avatar aesthetic; simple, polished, human, and mature
Composition/framing: centered head-and-shoulders portrait, front-facing with a very slight three-quarter turn, generous breathing room around the head, designed to remain clear inside a circular crop
Lighting/mood: soft diffused daylight, gentle facial modeling, approachable and trustworthy
Color palette: warm off-white background, sage green, charcoal, restrained muted accents; balanced neutral palette
Materials/textures: natural skin texture simplified tastefully, soft matte fabric, restrained depth, no glossy plastic look
Constraints: square image; one person only; adult proportions; crisp silhouette; no text, logo, border, frame, props, watermark, or cast shadow
Avoid: anime, manga, chibi, childlike face, oversized eyes, exaggerated smile, kawaii styling, photorealistic identity photo, heavy makeup, harsh contrast, neon colors, blue gender coding, busy background
```

## 女性默认头像

```text
Use case: stylized-concept
Asset type: default profile avatar for a premium nutrition and health-management mobile app
Primary request: create a refined, minimal female default avatar for an adult user, matching the paired male avatar exactly in visual system
Subject: friendly East Asian adult woman, about 30-40 years old, natural collarbone-length dark hair with a simple side part, calm warm expression, understated muted green knit top with an off-white neckline
Style/medium: premium editorial 3D illustration with subtle soft realism; clean contemporary social-media avatar aesthetic; simple, polished, human, and mature
Composition/framing: centered head-and-shoulders portrait, front-facing with a very slight three-quarter turn, generous breathing room around the head, designed to remain clear inside a circular crop
Lighting/mood: soft diffused daylight, gentle facial modeling, approachable and trustworthy; match the male avatar's lighting direction and depth
Color palette: warm off-white background, sage green, charcoal, restrained muted accents; balanced neutral palette matching the male avatar
Materials/textures: natural skin texture simplified tastefully, soft matte fabric, restrained depth, no glossy plastic look
Constraints: square image; one person only; adult proportions; crisp silhouette; no text, logo, border, frame, hair accessories, props, watermark, or cast shadow
Avoid: anime, manga, chibi, childlike face, oversized eyes, exaggerated smile, kawaii styling, photorealistic identity photo, heavy makeup, harsh contrast, neon colors, pink gender coding, busy background
```

## 验收标准

- 两张图在 80px 圆形裁切下，面部与发型仍能清晰识别。
- 背景、光线、人物尺度和肩部位置一致，切换性别时不产生视觉跳动。
- 人物明确为成年人，不带动漫、儿童或玩具质感。
- 不使用边框；头像圆框由应用界面统一绘制。
- 最终资源文件名保持为 `avatar-male.png` 与 `avatar-female.png`，上传 CDN 时使用新的内容哈希路径。
