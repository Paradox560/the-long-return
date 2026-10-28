/* Original, code-drawn pixel art. Rendering never changes campaign state. */
const TILE = 16;
const COLORS = {
  grass: ['#648774', '#668a75', '#608371', '#6a8b76', '#688773'],
  moss: '#547764', grassLight: '#87a17a', grassDark: '#476e5b',
  water: '#34666a', waterDark: '#2a565e', waterLight: '#76aaa1',
  path: '#b2ab83', pathLight: '#c2bb90', pathDark: '#8d9372',
  stone: '#8d9b8c', sand: '#c1b58d', ink: '#273d3c',
};

function hash(x, y, salt = 0) {
  let n = (Math.imul(Math.floor(x) + 131, 374761393) + Math.imul(Math.floor(y) + 197, 668265263) + Math.imul(salt + 17, 1274126177)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function stringSeed(value) {
  let result = 0;
  for (const character of String(value || 'world')) result = Math.imul(result, 31) + character.charCodeAt(0) | 0;
  return Math.abs(result);
}
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function rect(ctx, color, x, y, width, height) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
}

function ellipse(ctx, color, x, y, rx, ry, step = 2) {
  ctx.fillStyle = color;
  for (let yy = -Math.ceil(ry); yy <= ry; yy += step) {
    const fraction = yy / Math.max(1, ry);
    const extent = Math.round(Math.sqrt(Math.max(0, 1 - fraction * fraction)) * rx);
    ctx.fillRect(Math.round(x - extent), Math.round(y + yy), Math.max(1, extent * 2), step);
  }
}

function polygon(ctx, color, vertices, step = 1) {
  const minY = Math.floor(Math.min(...vertices.map(point => point[1])));
  const maxY = Math.ceil(Math.max(...vertices.map(point => point[1])));
  ctx.fillStyle = color;
  for (let y = minY; y <= maxY; y += step) {
    const intersections = [];
    for (let index = 0; index < vertices.length; index++) {
      const a = vertices[index], b = vertices[(index + 1) % vertices.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        intersections.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
    }
    intersections.sort((a, b) => a - b);
    for (let index = 0; index < intersections.length; index += 2) {
      ctx.fillRect(Math.round(intersections[index]), y, Math.max(1, Math.round(intersections[index + 1] - intersections[index])), step);
    }
  }
}

function footprint(object) {
  const defaults = {
    tree: [1, 1], house: [4, 3], tower: [2, 3], well: [1, 1], crate: [1, 1],
    camp: [2, 2], ruin: [3, 2], bridge: [3, 1], sign: [1, 1], sluice: [3, 2], flowers: [1, 1],
  };
  const fallback = defaults[object.type] || [1, 1];
  return { x: number(object.x) * TILE, y: number(object.y) * TILE, w: Math.max(.5, number(object.w, fallback[0])) * TILE, h: Math.max(.5, number(object.h, fallback[1])) * TILE };
}

function terrainAt(region, x, y) {
  const width = number(region.width, 64), height = number(region.height, 48);
  if (x < 0 || y < 0 || x >= width || y >= height) return 'grass';
  const tile = region.tiles?.[y * width + x];
  return typeof tile === 'string' ? tile : tile?.type || 'grass';
}

function grassTile(ctx, x, y, seed) {
  const random = hash(x, y, seed);
  rect(ctx, COLORS.grass[Math.floor(random * COLORS.grass.length) % COLORS.grass.length], x * TILE, y * TILE, TILE, TILE);
  for (let index = 0; index < 8; index++) {
    const px = x * TILE + Math.floor(hash(x, y, seed + index * 7 + 1) * 15);
    const py = y * TILE + Math.floor(hash(x, y, seed + index * 11 + 2) * 15);
    rect(ctx, index % 3 === 0 ? COLORS.grassLight : COLORS.moss, px, py, index % 3 === 0 ? 1 : 2, 1);
    if (index < 2) rect(ctx, COLORS.grassDark, px + 1, py - 1, 1, 2);
  }
  if (random > .82) {
    const px = x * TILE + 5, py = y * TILE + 9;
    rect(ctx, '#47725c', px, py - 2, 1, 3);
    rect(ctx, '#82a37b', px + 2, py - 4, 1, 4);
    rect(ctx, '#507b61', px + 4, py - 1, 1, 3);
  }
}

function flowers(ctx, x, y, seed, count = 8) {
  const palette = ['#e7dca6', '#dabd75', '#e5b29a', '#b4bfb2'];
  for (let index = 0; index < count; index++) {
    const px = x + Math.round(hash(seed, index, 2) * 15), py = y + Math.round(hash(seed, index, 3) * 14);
    rect(ctx, '#446e56', px, py, 1, 3);
    rect(ctx, palette[index % palette.length], px - 1, py - 1, 3, 1);
    rect(ctx, palette[index % palette.length], px, py - 2, 1, 3);
    rect(ctx, '#e1bb6c', px, py - 1, 1, 1);
  }
}

function drawGround(ctx, region) {
  const width = number(region.width, 64), height = number(region.height, 48), seed = stringSeed(region.id);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const type = terrainAt(region, x, y), px = x * TILE, py = y * TILE;
    grassTile(ctx, x, y, seed);
    if (type === 'water') {
      rect(ctx, hash(x, y, 8) > .7 ? '#376b6c' : COLORS.water, px, py, TILE, TILE);
      for (let index = 0; index < 3; index++) {
        const yy = py + Math.floor(hash(x, y, index + 10) * 14);
        rect(ctx, COLORS.waterDark, px + Math.floor(hash(x, y, index + 20) * 10), yy, 3 + index, 1);
      }
      if (terrainAt(region, x, y - 1) !== 'water') {
        rect(ctx, '#426c5b', px, py, TILE, 3);
        rect(ctx, '#92a082', px + 1, py, 5, 1);
        rect(ctx, '#a3ad8e', px + 10, py + 1, 4, 1);
        rect(ctx, '#254f55', px, py + 3, TILE, 2);
      }
      if (terrainAt(region, x, y + 1) !== 'water') {
        rect(ctx, '#8a9e7d', px, py + 14, TILE, 2);
        rect(ctx, '#b1b58e', px + 4, py + 14, 5, 1);
      }
      if (terrainAt(region, x - 1, y) !== 'water') rect(ctx, '#4b7764', px, py, 2, TILE);
      if (terrainAt(region, x + 1, y) !== 'water') rect(ctx, '#91a586', px + 14, py, 2, TILE);
    } else if (type === 'path' || type === 'sand') {
      const main = type === 'sand' ? COLORS.sand : COLORS.path;
      rect(ctx, main, px + 1, py + 1, 14, 14);
      if (terrainAt(region, x - 1, y) === type) rect(ctx, main, px, py + 1, 2, 14);
      if (terrainAt(region, x + 1, y) === type) rect(ctx, main, px + 14, py + 1, 2, 14);
      if (terrainAt(region, x, y - 1) === type) rect(ctx, main, px + 1, py, 14, 2);
      if (terrainAt(region, x, y + 1) === type) rect(ctx, main, px + 1, py + 14, 14, 2);
      // Fill the intersections as one continuous ground surface.
      if (terrainAt(region, x - 1, y) === type && terrainAt(region, x, y - 1) === type) rect(ctx, main, px, py, 2, 2);
      if (terrainAt(region, x + 1, y) === type && terrainAt(region, x, y - 1) === type) rect(ctx, main, px + 14, py, 2, 2);
      if (terrainAt(region, x - 1, y) === type && terrainAt(region, x, y + 1) === type) rect(ctx, main, px, py + 14, 2, 2);
      if (terrainAt(region, x + 1, y) === type && terrainAt(region, x, y + 1) === type) rect(ctx, main, px + 14, py + 14, 2, 2);
      for (let index = 0; index < 7; index++) {
        const xx = px + Math.floor(hash(x, y, index + 70) * 14) + 1;
        const yy = py + Math.floor(hash(x, y, index + 80) * 14) + 1;
        rect(ctx, index < 4 ? COLORS.pathLight : COLORS.pathDark, xx, yy, index % 3 === 0 ? 2 : 1, 1);
      }
      if (hash(x, y, 21) > .8) {
        rect(ctx, '#8b947a', px + 5, py + 10, 4, 2);
        rect(ctx, '#d1c8a2', px + 5, py + 10, 3, 1);
      }
    } else if (type === 'stone') {
      rect(ctx, '#738c7d', px, py, TILE, TILE);
      for (let row = 0; row < 3; row++) for (let column = 0; column < 2; column++) {
        const xx = px + column * 8 + (row % 2 ? 2 : 0), yy = py + row * 5;
        rect(ctx, hash(x + column, y + row, 2) > .5 ? '#a1ac95' : '#8b9d8a', xx, yy, 7, 4);
        rect(ctx, '#b0b69d', xx + 1, yy, 5, 1);
      }
    } else if (type === 'flowers') flowers(ctx, px, py, x * 30 + y, 6);
  }
  // Reeds and bank stones are registered to the terrain, never inferred from pixels.
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    if (terrainAt(region, x, y) !== 'grass' || hash(x, y, 43) < .45) continue;
    if (![terrainAt(region, x - 1, y), terrainAt(region, x + 1, y), terrainAt(region, x, y - 1), terrainAt(region, x, y + 1)].includes('water')) continue;
    for (let index = 0; index < 4; index++) {
      const xx = x * TILE + 4 + index * 3, yy = y * TILE + 10 + (index % 2) * 3;
      rect(ctx, '#3d6a56', xx, yy - 7, 1, 9);
      rect(ctx, index % 2 ? '#a7a476' : '#81926a', xx + 1, yy - 9, 1, 8);
      rect(ctx, '#a99867', xx + 1, yy - 10, 2, 3);
    }
  }
}

function tree(ctx, object, player, seed) {
  const box = footprint(object), x = box.x + box.w / 2, y = box.y + box.h * .82;
  const scale = .9 + hash(seed, 1, 4) * .32;
  const canopyWidth = 23 * scale, canopyHeight = 35 * scale;
  ellipse(ctx, 'rgba(25,51,43,.22)', x + 8, y + 2, 20 * scale, 8);
  rect(ctx, '#594d39', x - 3, y - 22, 6, 23);
  rect(ctx, '#9a8257', x - 1, y - 20, 2, 20);
  rect(ctx, '#705f42', x - 6, y - 1, 4, 3);
  rect(ctx, '#6c6040', x + 2, y - 2, 5, 3);
  const behind = player && Math.abs(player.x * TILE - x) < canopyWidth + 4 && player.y * TILE > y - canopyHeight - 21 && player.y * TILE < y + 3;
  ctx.save();
  if (behind) ctx.globalAlpha = .43;
  const dark = ['#2c5548', '#305b4b', '#345d4c'][seed % 3];
  const mid = ['#416f54', '#487457', '#426e56'][seed % 3];
  const light = ['#668d61', '#78956a', '#6c9166'][seed % 3];
  ellipse(ctx, dark, x, y - 22, canopyWidth, 19 * scale);
  ellipse(ctx, dark, x - 9 * scale, y - 29, 14 * scale, 15 * scale);
  ellipse(ctx, mid, x + 9 * scale, y - 29, 15 * scale, 15 * scale);
  ellipse(ctx, mid, x - 6 * scale, y - 34, 16 * scale, 16 * scale);
  ellipse(ctx, light, x - 4 * scale, y - 39, 12 * scale, 10 * scale);
  ellipse(ctx, '#567f59', x + 11 * scale, y - 24, 10 * scale, 9 * scale);
  for (let index = 0; index < 28; index++) {
    const xx = x - 19 * scale + hash(seed, index, 8) * 38 * scale;
    const yy = y - 45 * scale + hash(seed, index, 11) * 32 * scale;
    if (((xx - x) / 24) ** 2 + ((yy - (y - 28)) / 22) ** 2 < .8) {
      rect(ctx, index % 4 === 0 ? '#a0ac77' : index % 3 === 0 ? '#355e48' : '#7e9b69', xx, yy, 2 + index % 2, 1);
    }
  }
  ctx.restore();
}

function roof(ctx, x, y, width, height, seed, palette) {
  const [dark, base, light] = palette;
  polygon(ctx, '#3e5147', [[x - 3, y + height + 3], [x + width / 2, y - 2], [x + width + 3, y + height + 3]]);
  polygon(ctx, base, [[x - 2, y + height], [x + width / 2, y], [x + width + 2, y + height]]);
  polygon(ctx, dark, [[x + width / 2, y + 1], [x + width + 2, y + height], [x + width / 2, y + height]]);
  for (let row = 0; row < height - 2; row += 4) {
    const half = (row + 2) / height * (width / 2 + 1);
    const left = x + width / 2 - half;
    for (let column = 0; column < half * 2; column += 6) {
      rect(ctx, row % 8 === 0 ? light : base, left + column + (row % 8 ? 2 : 0), y + row + 1, Math.min(4, half * 2 - column), 1);
      if (hash(row, column, seed) > .6) rect(ctx, dark, left + column + 3, y + row + 2, 1, 2);
    }
  }
  rect(ctx, light, x + width / 2 - 1, y, 3, 3);
  rect(ctx, dark, x - 3, y + height, width + 6, 3);
  rect(ctx, light, x - 2, y + height, width + 4, 1);
}

function windowLight(ctx, x, y, width = 8, lit = true) {
  rect(ctx, '#40534b', x - 2, y - 2, width + 4, 12);
  rect(ctx, '#b39768', x - 1, y - 1, width + 2, 10);
  rect(ctx, lit ? '#e5c982' : '#5b7972', x, y, width, 8);
  if (lit) rect(ctx, '#f6df9f', x + 1, y + 1, width - 2, 3);
  rect(ctx, '#6e7654', x + width / 2, y, 1, 9);
  rect(ctx, '#6e7654', x, y + 4, width, 1);
  rect(ctx, '#536757', x - 2, y + 9, width + 4, 2);
}

function house(ctx, object, seed, time, dusk) {
  const box = footprint(object), width = Math.max(30, box.w - 4), height = Math.max(24, box.h), x = box.x + 2, bottom = box.y + height;
  const roofHeight = Math.max(18, Math.min(58, height * .48)), wallHeight = Math.max(19, height * .55), top = bottom - wallHeight;
  const abandoned = object.abandoned === true || /shuttered/i.test(object.label || '');
  const flooded = /flooded/i.test(object.label || '');
  const roofColors = seed % 4 === 0 ? ['#7a694e', '#a78c5b', '#cbb67e'] : seed % 4 === 1 ? ['#6c7770', '#859385', '#b4b99a'] : ['#886849', '#b18a57', '#d1ae72'];
  ellipse(ctx, 'rgba(33,55,45,.2)', x + width / 2 + 7, bottom + 2, width / 2 + 9, 8);
  rect(ctx, '#526c60', x - 1, bottom - 5, width + 2, 7);
  for (let stone = 0; stone < width; stone += 7) {
    rect(ctx, stone % 14 ? '#8c9980' : '#a5ac90', x + stone, bottom - 4, Math.min(6, width - stone), 3);
    rect(ctx, '#b2b39a', x + stone + 1, bottom - 4, 4, 1);
  }
  rect(ctx, '#c1b58f', x, top, width, wallHeight - 4);
  rect(ctx, '#a29b7d', x + width - 7, top, 7, wallHeight - 4);
  rect(ctx, '#d8c7a0', x + 2, top + 3, width - 11, 2);
  rect(ctx, '#70755a', x + 2, top, 3, wallHeight - 4);
  rect(ctx, '#827b5d', x + width - 10, top, 3, wallHeight - 4);
  if (wallHeight > 35) {
    rect(ctx, '#8f8866', x + 3, top + 19, width - 12, 3);
    for (let xx = 18; xx < width - 15; xx += 28) {
      rect(ctx, '#8f8866', x + xx, top, 2, wallHeight - 4);
      if (xx + 12 < width - 10) windowLight(ctx, x + xx + 6, top + 5, 7, !abandoned);
    }
  }
  const doorX = x + width * .5 - 5;
  rect(ctx, '#495344', doorX - 1, bottom - 21, 12, 19);
  rect(ctx, '#7b7050', doorX, bottom - 20, 10, 18);
  rect(ctx, '#a28d5d', doorX + 2, bottom - 18, 2, 15);
  rect(ctx, '#e0bf76', doorX + 7, bottom - 11, 1, 2);
  rect(ctx, '#b8b594', doorX - 3, bottom - 1, 16, 3);
  rect(ctx, '#8b9a81', doorX - 2, bottom + 3, 14, 2);
  if (width > 42) {
    windowLight(ctx, x + 9, bottom - 20, 7, !abandoned);
    windowLight(ctx, x + width - 22, bottom - 20, 7, !abandoned);
    if (abandoned) {
      for (const xx of [x + 8, x + width - 23]) {
        rect(ctx, '#827854', xx, bottom - 21, 10, 10);
        rect(ctx, '#b0a375', xx, bottom - 20, 10, 2);
        rect(ctx, '#615f45', xx + 4, bottom - 19, 1, 8);
      }
    }
  }
  roof(ctx, x - 3, top - roofHeight + 5, width + 6, roofHeight, seed, roofColors);
  // Chimney, soot and small discrete puffs.
  const chimneyX = x + width * .73;
  rect(ctx, '#617367', chimneyX, top - roofHeight + 3, 7, 14);
  rect(ctx, '#9aa58e', chimneyX, top - roofHeight + 3, 5, 13);
  rect(ctx, '#40594e', chimneyX - 1, top - roofHeight + 2, 9, 3);
  if (!abandoned && !flooded && seed % 3 !== 0) {
    for (let index = 0; index < 3; index++) {
      const phase = (time * 4 + index * 6 + seed % 7) % 20;
      ctx.save(); ctx.globalAlpha = .13 * (1 - phase / 24);
      ellipse(ctx, '#d0d5bb', chimneyX + 2 + Math.sin(phase / 5) * 3 + phase / 5, top - roofHeight - phase, 3 + phase / 5, 2 + phase / 7, 2);
      ctx.restore();
    }
  }
  if (seed % 2 === 0) {
    rect(ctx, '#6c6d48', x + 3, bottom - 1, 5, 4);
    rect(ctx, '#849260', x + 2, bottom - 5, 7, 4);
    rect(ctx, '#d3b786', x + 3, bottom - 6, 2, 2);
  }
  if (flooded) {
    rect(ctx, '#7d8864', x, bottom - 9, width, 5);
    for (let index = 0; index < width; index += 9) rect(ctx, '#8c9970', x + index, bottom - 12 + hash(index, seed) * 4, 6, 5);
    rect(ctx, '#6d9182', x + 4, bottom + 2, width - 8, 1);
  }
  if (dusk && !abandoned && !flooded) {
    ctx.save(); ctx.globalAlpha = .09;
    ellipse(ctx, '#ffd489', doorX + 5, bottom + 5, 17, 7);
    ctx.restore();
  }
}

function tower(ctx, object, seed) {
  const box = footprint(object), center = box.x + box.w / 2, bottom = box.y + box.h, width = Math.max(24, box.w - 3), towerHeight = Math.max(73, box.h + 3), top = bottom - towerHeight;
  polygon(ctx, 'rgba(28,49,42,.19)', [[center - 9, bottom + 2], [center + 18, bottom + 7], [center + 50, bottom + 19], [center + 37, bottom - 3]]);
  rect(ctx, '#526a60', center - width / 2 - 3, bottom - 5, width + 6, 7);
  rect(ctx, '#a5ad91', center - width / 2, top + 13, width, towerHeight - 13);
  rect(ctx, '#788f7c', center + width / 2 - 8, top + 13, 8, towerHeight - 13);
  for (let row = 0; row < Math.ceil((towerHeight - 17) / 5); row++) {
    const yy = top + 17 + row * 5;
    rect(ctx, '#829780', center - width / 2 + 1, yy, width - 2, 1);
    for (let column = 0; column < 3; column++) {
      const xx = center - width / 2 + 4 + column * 8 + row % 2 * 4;
      if (xx < center + width / 2 - 2) rect(ctx, '#8b9d84', xx, yy - 4, 1, 4);
    }
  }
  rect(ctx, '#d0c8a1', center - width / 2 - 2, top + 25, width + 4, 3);
  rect(ctx, '#6a806d', center - width / 2 - 1, top + 28, width + 2, 2);
  rect(ctx, '#344e46', center - 7, top + 8, 14, 17);
  rect(ctx, '#344e46', center - 5, top + 5, 10, 4);
  rect(ctx, '#c4a967', center - 1, top + 6, 2, 5);
  polygon(ctx, '#c5a263', [[center - 3, top + 11], [center + 3, top + 11], [center + 5, top + 20], [center - 5, top + 20]]);
  rect(ctx, '#efd18b', center - 3, top + 12, 2, 6);
  rect(ctx, '#8d794a', center - 6, top + 20, 12, 2);
  rect(ctx, '#d8b970', center - 1, top + 22, 2, 2);
  for (let yy = top + 41; yy < bottom - 26; yy += 25) {
    rect(ctx, '#6b806b', center - 4, yy - 2, 8, 13);
    rect(ctx, '#39564b', center - 2, yy, 4, 9);
    rect(ctx, '#c1b990', center - 5, yy + 11, 10, 2);
  }
  roof(ctx, center - width / 2 - 4, top - 12, width + 8, 17, seed, ['#7c7051', '#ad925d', '#d8ba78']);
  rect(ctx, '#566951', center, top - 20, 1, 9);
  rect(ctx, '#d5c180', center - 2, top - 20, 5, 2);
  rect(ctx, '#3e594b', center - 5, bottom - 20, 10, 20);
  rect(ctx, '#344e44', center - 3, bottom - 23, 6, 5);
  rect(ctx, '#7b7b57', center - 3, bottom - 18, 6, 17);
  rect(ctx, '#c7b47d', center - 7, bottom, 14, 3);
  rect(ctx, '#859479', center - 9, bottom + 3, 18, 3);
  // Moss grows along mortar and the shaded lower stones.
  for (let index = 0; index < 11; index++) rect(ctx, index % 2 ? '#547b58' : '#6c8c62', center + width / 2 - 7 + hash(seed, index) * 6, bottom - index * 3, 3, 2);
}

function well(ctx, object) {
  const box = footprint(object), x = box.x + box.w / 2, y = box.y + box.h - 2;
  ellipse(ctx, 'rgba(31,53,43,.22)', x + 4, y + 2, 14, 5);
  ellipse(ctx, '#61766a', x, y - 2, 11, 7);
  ellipse(ctx, '#a8ae91', x, y - 6, 11, 5);
  ellipse(ctx, '#2f5351', x, y - 6, 7, 3, 1);
  rect(ctx, '#647366', x - 11, y - 4, 3, 5);
  rect(ctx, '#bdc1a0', x - 9, y - 2, 4, 3);
  rect(ctx, '#8e9d85', x + 3, y - 1, 4, 3);
  rect(ctx, '#74694a', x - 10, y - 22, 3, 18);
  rect(ctx, '#a68f5c', x + 8, y - 22, 3, 18);
  rect(ctx, '#7a7453', x - 9, y - 18, 18, 2);
  rect(ctx, '#bfac75', x, y - 18, 1, 11);
  roof(ctx, x - 13, y - 28, 26, 11, 4, ['#786b4c', '#ac925e', '#c7ae74']);
}

function crate(ctx, object) {
  const box = footprint(object), empty = /empty/i.test(object.label || '');
  rect(ctx, '#7a7954', box.x + 1, box.y + 1, box.w - 2, box.h - 2);
  for (let yy = 2; yy < box.h - 3; yy += 5) rect(ctx, '#aa9766', box.x + 2, box.y + yy, box.w - 4, 3);
  if (empty) return;
  for (let row = 0; row < Math.max(1, Math.floor(box.h / 14)); row++) for (let column = 0; column < Math.max(1, Math.floor(box.w / 14)); column++) {
    const x = box.x + 2 + column * 14, y = box.y + 1 + row * 14;
    ellipse(ctx, 'rgba(31,53,43,.2)', x + 8, y + 13, 9, 3);
    rect(ctx, '#6d6145', x, y, 13, 13);
    rect(ctx, '#a68d5d', x + 1, y + 1, 11, 10);
    rect(ctx, '#c3aa70', x + 1, y + 1, 11, 2);
    rect(ctx, '#7e704d', x + 2, y + 4, 9, 1);
    rect(ctx, '#7e704d', x + 2, y + 8, 9, 1);
    rect(ctx, '#c0a46b', x + 1, y + 1, 2, 11);
    rect(ctx, '#8b784f', x + 10, y + 1, 2, 11);
    for (let index = 0; index < 9; index++) rect(ctx, '#c4aa73', x + 2 + index, y + 2 + index, 2, 1);
  }
}

function camp(ctx, object, time) {
  const box = footprint(object), x = box.x + 1, y = box.y + box.h - 4, width = Math.min(30, box.w);
  ellipse(ctx, 'rgba(31,53,43,.19)', x + width / 2 + 3, y + 1, width / 2 + 6, 5);
  polygon(ctx, '#777e5b', [[x, y], [x + width * .45, y - 22], [x + width, y]]);
  polygon(ctx, '#c8bd8e', [[x, y], [x + width * .45, y - 22], [x + width * .64, y]]);
  polygon(ctx, '#3f594b', [[x + 6, y], [x + width * .45, y - 16], [x + width * .56, y]]);
  rect(ctx, '#e0ce9b', x + width * .45, y - 24, 2, 3);
  rect(ctx, '#6b7150', x - 3, y - 1, 4, 3);
  rect(ctx, '#6b7150', x + width - 1, y - 1, 4, 3);
  const fx = x + width + 6, fy = y + 2;
  ellipse(ctx, '#6e7a63', fx, fy, 7, 3);
  rect(ctx, '#665a40', fx - 5, fy - 1, 10, 2);
  const flicker = Math.floor(time * 6) % 3;
  polygon(ctx, '#d3944b', [[fx - 4, fy], [fx - 2, fy - 7 - flicker], [fx, fy - 4], [fx + 2, fy - 9 + flicker], [fx + 4, fy]]);
  rect(ctx, '#f0cc77', fx - 1, fy - 4, 3, 4);
  rect(ctx, '#f9dfa0', fx, fy - 3, 1, 2);
}

function ruin(ctx, object, seed) {
  const box = footprint(object), x = box.x, y = box.y, width = box.w, height = box.h;
  ellipse(ctx, 'rgba(31,53,43,.17)', x + width / 2, y + height - 3, width / 2 + 2, 7);
  rect(ctx, '#738572', x + 1, y + 2, width - 2, height - 3);
  for (let index = 0; index < width * height / 35; index++) {
    const xx = x + 2 + hash(seed, index, 42) * (width - 8), yy = y + 3 + hash(seed, index, 45) * (height - 7);
    rect(ctx, '#98a489', xx, yy, 5, 3);
    rect(ctx, '#bbc0a0', xx, yy, 4, 1);
  }
  const rows = Math.max(4, Math.floor(height / 5));
  for (let row = 0; row < rows; row++) for (let column = 0; column < Math.ceil(width / 8); column++) {
    if (row < 2 && hash(column, row, seed) > .55) continue;
    if (row > 2 && row < rows - 2 && column > 1 && column < Math.ceil(width / 8) - 2 && hash(column, 3, seed) > .45) continue;
    const xx = x + column * 8 + (row % 2 ? 2 : 0), yy = y + height - 3 - (rows - row) * 5;
    rect(ctx, '#657b6b', xx, yy + 1, 8, 5);
    rect(ctx, '#9aa58a', xx, yy, 7, 4);
    rect(ctx, '#bac0a2', xx + 1, yy, 5, 1);
    if (hash(column, row, seed + 1) > .5) rect(ctx, '#547956', xx, yy, 3, 3);
  }
  for (let index = 0; index < 7; index++) {
    const xx = x + hash(seed, index, 9) * width, yy = y + height - 6 + hash(seed, index, 10) * 12;
    rect(ctx, '#a0aa8d', xx, yy, 5, 3);
    rect(ctx, '#c0c1a0', xx, yy, 4, 1);
  }
  flowers(ctx, x + 3, y + height - 7, seed, 5);
}

function bridge(ctx, object) {
  const box = footprint(object), horizontal = box.w >= box.h;
  const x = box.x, y = box.y, width = box.w, height = box.h;
  rect(ctx, 'rgba(23,45,41,.3)', x + 3, y + 4, width, height);
  rect(ctx, '#5b654b', x, y, width, height);
  if (horizontal) {
    for (let offset = 0; offset < width; offset += 5) {
      rect(ctx, '#a59669', x + offset, y + 2, 4, height - 3);
      rect(ctx, '#c4b381', x + offset, y + 2, 1, height - 3);
      rect(ctx, '#8a8158', x + offset + 1, y + 5, 2, 1);
    }
    rect(ctx, '#7b7753', x, y - 1, width, 2);
    rect(ctx, '#c0a979', x, y - 2, width, 1);
    rect(ctx, '#777052', x, y + height - 1, width, 3);
    for (const offset of [2, width - 5]) {
      rect(ctx, '#756d4d', x + offset, y - 6, 3, 10);
      rect(ctx, '#ceb786', x + offset, y - 6, 3, 2);
      rect(ctx, '#756d4d', x + offset, y + height - 7, 3, 11);
      rect(ctx, '#ceb786', x + offset, y + height - 7, 3, 2);
    }
  } else {
    for (let offset = 0; offset < height; offset += 5) {
      rect(ctx, '#a59669', x + 2, y + offset, width - 3, 4);
      rect(ctx, '#c4b381', x + 2, y + offset, width - 3, 1);
    }
    rect(ctx, '#7b7753', x, y, 2, height);
    rect(ctx, '#b5a176', x + width - 2, y, 2, height);
  }
}

function sign(ctx, object) {
  const box = footprint(object), x = box.x + box.w / 2, y = box.y + box.h;
  ellipse(ctx, 'rgba(31,53,43,.2)', x + 3, y, 7, 2);
  rect(ctx, '#746547', x - 1, y - 20, 3, 20);
  rect(ctx, '#9b895b', x - 1, y - 20, 1, 18);
  rect(ctx, '#6c6448', x - 10, y - 21, 20, 9);
  rect(ctx, '#b09c6a', x - 10, y - 21, 19, 7);
  rect(ctx, '#c6b47e', x - 9, y - 21, 17, 1);
  rect(ctx, '#665f43', x - 6, y - 18, 10, 1);
  rect(ctx, '#665f43', x - 6, y - 16, 6, 1);
  rect(ctx, '#d0b879', x, y - 20, 1, 1);
}

function sluice(ctx, object, state, time) {
  const box = footprint(object), x = box.x, y = box.y, width = box.w, height = box.h;
  const repaired = !!state.flags?.sluiceRepaired;
  rect(ctx, '#425f57', x, y, width, height);
  for (let index = 0; index < width; index += 8) {
    rect(ctx, '#84917c', x + index, y, 7, 6);
    rect(ctx, '#a4ad8d', x + index, y, 6, 1);
    rect(ctx, '#6a806c', x + index, y + height - 6, 7, 6);
  }
  rect(ctx, '#364d47', x + 5, y + 7, width - 10, height - 14);
  for (let index = 0; index < width - 10; index += 5) {
    rect(ctx, repaired ? '#8c916b' : '#7e7458', x + 5 + index, y + 7, 3, height - 14);
    rect(ctx, '#b0a272', x + 5 + index, y + 7, 1, height - 14);
  }
  for (const xx of [x + 2, x + width - 7]) {
    rect(ctx, '#4a6256', xx, y - 12, 5, 25);
    rect(ctx, '#95a085', xx, y - 12, 3, 25);
  }
  rect(ctx, '#a4a17a', x + 1, y - 13, width - 2, 4);
  rect(ctx, '#586f5b', x + width / 2, y - 17, 2, 22);
  ellipse(ctx, '#746b4e', x + width / 2, y - 14, 7, 6, 1);
  ellipse(ctx, repaired ? '#c7ac6a' : '#aa875b', x + width / 2, y - 15, 7, 5, 1);
  ellipse(ctx, '#3e5e51', x + width / 2, y - 15, 4, 3, 1);
  rect(ctx, '#bca16a', x + width / 2 - 1, y - 20, 2, 11);
  rect(ctx, '#bca16a', x + width / 2 - 6, y - 16, 12, 2);
  if (!repaired) {
    const shimmer = Math.floor(time * 3) % 3;
    rect(ctx, '#a2bfb0', x + width / 2 - 3 + shimmer, y + height - 6, 7, 1);
    rect(ctx, '#76a69a', x + width / 2 + 2 - shimmer, y + height - 3, 8, 1);
  }
}

function sprite(ctx, entity, time, options = {}) {
  const x = number(entity.x) * TILE, foot = number(entity.y) * TILE;
  const seed = stringSeed(entity.id || entity.name || 'player');
  const moving = options.moving;
  const stride = moving ? Math.sin(time * 12) : 0;
  const bob = moving ? Math.abs(stride) > .6 ? 1 : 0 : Math.sin(time * 1.25 + seed) > .94 ? 1 : 0;
  const y = foot - bob;
  const player = options.player;
  const coat = player ? '#d2b87c' : entity.color || ['#6f8990', '#9d8d74', '#a77561', '#92a07b'][seed % 4];
  const direction = options.direction || 'down';
  ellipse(ctx, 'rgba(27,48,42,.26)', x + 1, foot + 1, player ? 6 : 5, 2, 1);
  rect(ctx, '#334d45', x - 4, y - 4, 3, 4 + Math.round(stride));
  rect(ctx, '#334d45', x + 1, y - 4, 3, 4 - Math.round(stride));
  rect(ctx, '#4e5240', x - 4, y - 1 + Math.round(stride), 3, 2);
  rect(ctx, '#4e5240', x + 1, y - 1 - Math.round(stride), 4, 2);
  rect(ctx, '#435d4b', x - 5, y - 13, 10, 10);
  rect(ctx, coat, x - 4, y - 13, 8, 9);
  rect(ctx, player ? '#ecce93' : '#c1bc92', x - 3, y - 12, 2, 5);
  rect(ctx, '#847957', x - 4, y - 6, 8, 2);
  rect(ctx, coat, x - 6, y - 12 + Math.round(stride), 2, 6);
  rect(ctx, coat, x + 4, y - 12 - Math.round(stride), 2, 6);
  rect(ctx, '#d1ac7f', x - 6, y - 7 + Math.round(stride), 2, 2);
  rect(ctx, '#d1ac7f', x + 4, y - 7 - Math.round(stride), 2, 2);
  rect(ctx, '#715d43', x - 4, y - 20, 8, 7);
  rect(ctx, '#dcba8d', x - 3, y - 18, 6, 6);
  rect(ctx, '#ebc99b', x - 2, y - 18, 4, 2);
  if (direction !== 'up') {
    const faceOffset = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
    rect(ctx, '#3a4b41', x - 2 + faceOffset, y - 16, 1, 1);
    rect(ctx, '#3a4b41', x + 1 + faceOffset, y - 16, 1, 1);
  } else rect(ctx, '#766343', x - 3, y - 18, 6, 5);
  if (player) {
    rect(ctx, '#6d7b59', x - 4, y - 23, 8, 5);
    rect(ctx, '#adb07e', x - 3, y - 23, 5, 2);
    rect(ctx, '#566d51', x - 7, y - 19, 14, 2);
    rect(ctx, '#c9bb84', x - 5, y - 19, 10, 1);
    rect(ctx, '#4b7868', x - 3, y - 13, 6, 2);
    rect(ctx, '#82a48b', x + 2, y - 13, 2, 5);
    rect(ctx, '#735f42', x + 3, y - 10, 4, 6);
    rect(ctx, '#a28a58', x + 4, y - 9, 2, 2);
    // Surveyor's walking staff: visible, original silhouette.
    rect(ctx, '#6b6044', x + 8, y - 13, 1, 15);
    rect(ctx, '#c1b27e', x + 8, y - 13, 1, 3);
  } else if (seed % 3 === 0) {
    rect(ctx, '#7c7b60', x - 4, y - 22, 8, 4);
    rect(ctx, '#b4a77d', x - 6, y - 19, 12, 2);
  } else {
    rect(ctx, seed % 2 ? '#78634a' : '#4b5140', x - 4, y - 21, 8, 4);
    rect(ctx, '#ac9871', x - 3, y - 21, 3, 1);
  }
}

export class WorldRenderer {
  constructor(canvas) {
    if (!canvas?.getContext) throw new TypeError('WorldRenderer needs a canvas.');
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.camera = { x: 0, y: 0 };
    this.visibleTargets = [];
    this.tileSize = TILE;
    this._grounds = new Map();
    this._lastRegion = null;
    this._lastPlayer = null;
    this._lastTime = 0;
    this._direction = 'down';
    this._cssWidth = 0;
    this._cssHeight = 0;
    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => this.resize());
      this._resizeObserver.observe(canvas);
    }
  }

  resize() {
    const bounds = this.canvas.getBoundingClientRect();
    const width = Math.max(1, bounds.width || this.canvas.clientWidth || 960);
    const height = Math.max(1, bounds.height || this.canvas.clientHeight || 640);
    if (width === this._cssWidth && height === this._cssHeight) return;
    this._cssWidth = width; this._cssHeight = height;
    const scale = width >= 900 ? 2 : width >= 600 ? 1.75 : 1.25;
    this.canvas.width = Math.max(160, Math.round(width / scale));
    this.canvas.height = Math.max(120, Math.round(height / scale));
    this.canvas.style.imageRendering = 'pixelated';
    if (this.ctx) this.ctx.imageSmoothingEnabled = false;
  }

  screenToWorld(clientX, clientY) {
    const bounds = this.canvas.getBoundingClientRect();
    const x = ((clientX - bounds.left) * this.canvas.width / Math.max(1, bounds.width) + this.camera.x) / TILE;
    const y = ((clientY - bounds.top) * this.canvas.height / Math.max(1, bounds.height) + this.camera.y) / TILE;
    return { x, y, tileX: Math.floor(x), tileY: Math.floor(y) };
  }

  _ground(region) {
    const width = number(region.width, 64), height = number(region.height, 48);
    const key = `${region.id || 'world'}:${region.version || region.revision || region.phase || ''}:${width}:${height}`;
    let cached = this._grounds.get(key);
    if (!cached || cached.tiles !== region.tiles || cached.region !== region) {
      const canvas = this.canvas.ownerDocument.createElement('canvas');
      canvas.width = width * TILE; canvas.height = height * TILE;
      const context = canvas.getContext('2d');
      context.imageSmoothingEnabled = false;
      drawGround(context, region);
      cached = { canvas, tiles: region.tiles, region };
      this._grounds.set(key, cached);
      if (this._grounds.size > 8) this._grounds.delete(this._grounds.keys().next().value);
    }
    return cached.canvas;
  }

  draw(state = {}, region = {}, timeSeconds = 0) {
    if (!this.ctx) return;
    this.resize();
    const ctx = this.ctx, time = number(timeSeconds), player = state.player || { x: 32, y: 24 };
    const regionWidth = number(region.width, 64) * TILE, regionHeight = number(region.height, 48) * TILE;
    const width = this.canvas.width, height = this.canvas.height;
    const targetX = clamp(number(player.x, 32) * TILE - width / 2, Math.min(0, (regionWidth - width) / 2), Math.max(0, regionWidth - width));
    const targetY = clamp(number(player.y, 24) * TILE - height * .55, Math.min(0, (regionHeight - height) / 2), Math.max(0, regionHeight - height));
    const delta = clamp(time - this._lastTime, .001, .08);
    if (this._lastRegion !== region.id || !this._lastPlayer || Math.abs(number(player.x) - this._lastPlayer.x) > 8 || Math.abs(number(player.y) - this._lastPlayer.y) > 8) {
      this._cameraX = targetX; this._cameraY = targetY;
    } else {
      const follow = 1 - Math.exp(-delta * 12);
      this._cameraX += (targetX - this._cameraX) * follow;
      this._cameraY += (targetY - this._cameraY) * follow;
    }
    this.camera.x = Math.round(this._cameraX); this.camera.y = Math.round(this._cameraY);
    const dx = this._lastPlayer ? number(player.x) - this._lastPlayer.x : 0;
    const dy = this._lastPlayer ? number(player.y) - this._lastPlayer.y : 0;
    const moving = Math.abs(dx) + Math.abs(dy) > .0005;
    if (moving) this._direction = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up';
    const dusk = state.timeOfDay === 'dusk' || state.timeOfDay === 'night' || !!state.flags?.stormOccurred;
    rect(ctx, '#3e6658', 0, 0, width, height);
    ctx.save();
    ctx.translate(-this.camera.x, -this.camera.y);
    ctx.drawImage(this._ground(region), 0, 0);
    this._water(ctx, region, time, dusk);
    const objects = Array.isArray(region.objects) ? region.objects : [];
    const npcs = Array.isArray(region.npcs) ? region.npcs : [];
    const visible = (x, y, margin = 80) => x > this.camera.x - margin && x < this.camera.x + width + margin && y > this.camera.y - margin && y < this.camera.y + height + margin;
    const drawables = [];
    for (const object of objects) {
      const box = footprint(object);
      if (!visible(box.x + box.w / 2, box.y + box.h / 2, Math.max(100, box.w, box.h))) continue;
      if (object.type === 'bridge') bridge(ctx, object);
      else if (object.type === 'flowers') {
        for (let yy = 0; yy < box.h; yy += TILE) for (let xx = 0; xx < box.w; xx += TILE) flowers(ctx, box.x + xx, box.y + yy, stringSeed(object.id) + xx + yy, 7);
      } else drawables.push({ kind: 'object', value: object, depth: box.y + box.h * (object.type === 'tree' ? .82 : 1) });
    }
    for (const npc of npcs) if (visible(number(npc.x) * TILE, number(npc.y) * TILE)) drawables.push({ kind: 'npc', value: npc, depth: number(npc.y) * TILE });
    drawables.push({ kind: 'player', value: player, depth: number(player.y) * TILE });
    drawables.sort((a, b) => a.depth - b.depth || (a.kind === 'player' ? 1 : -1));
    for (const drawable of drawables) {
      if (drawable.kind === 'player') sprite(ctx, player, time, { player: true, moving, direction: this._direction });
      else if (drawable.kind === 'npc') sprite(ctx, drawable.value, time, { direction: 'down' });
      else {
        const object = drawable.value, seed = stringSeed(object.id || object.label || object.type);
        switch (object.type) {
          case 'tree': tree(ctx, object, player, seed); break;
          case 'house': house(ctx, object, seed, time, dusk); break;
          case 'tower': tower(ctx, object, seed); break;
          case 'well': well(ctx, object); break;
          case 'crate': crate(ctx, object); break;
          case 'camp': camp(ctx, object, time); break;
          case 'ruin': ruin(ctx, object, seed); break;
          case 'sign': sign(ctx, object); break;
          case 'sluice': sluice(ctx, object, state, time); break;
          default: {
            const box = footprint(object);
            ellipse(ctx, '#7f8c6b', box.x + box.w / 2, box.y + box.h - 3, box.w / 2, 5);
            rect(ctx, '#bbc19a', box.x + box.w / 2 - 3, box.y + box.h - 8, 6, 5);
          }
        }
      }
    }
    if (dusk) {
      rect(ctx, 'rgba(28,47,65,.12)', this.camera.x, this.camera.y, width, height);
      this._fireflies(ctx, region, time);
    }
    this._targets(ctx, state, region, time);
    ctx.restore();
    // A quiet edge treatment keeps the luminous center legible without a blur.
    rect(ctx, 'rgba(23,43,39,.06)', 0, 0, width, 3);
    rect(ctx, 'rgba(23,43,39,.05)', 0, height - 3, width, 3);
    this._lastPlayer = { x: number(player.x), y: number(player.y) };
    this._lastRegion = region.id; this._lastTime = time;
  }

  _water(ctx, region, time, dusk) {
    const left = Math.max(0, Math.floor(this.camera.x / TILE) - 1), top = Math.max(0, Math.floor(this.camera.y / TILE) - 1);
    const right = Math.min(number(region.width, 64), Math.ceil((this.camera.x + this.canvas.width) / TILE) + 1);
    const bottom = Math.min(number(region.height, 48), Math.ceil((this.camera.y + this.canvas.height) / TILE) + 1);
    const frame = Math.floor(time * 3);
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
      if (terrainAt(region, x, y) !== 'water' || hash(x, y, 72) < .4) continue;
      const px = x * TILE + 3 + Math.floor(hash(x, y, 91) * 8), py = y * TILE + 4 + Math.floor(hash(x, y, 92) * 8);
      const shift = (frame + Math.floor(hash(x, y, 2) * 8)) % 6;
      rect(ctx, dusk ? '#64988f' : '#79a99b', px + (shift < 3 ? shift : 6 - shift), py, 4, 1);
      if (hash(x, y, 77) > .7) rect(ctx, '#a0bca4', px - 2, py + 3, 2, 1);
    }
  }

  _fireflies(ctx, region, time) {
    const seed = stringSeed(region.id);
    for (let index = 0; index < 18; index++) {
      const x = hash(seed, index, 3) * number(region.width, 64) * TILE + Math.sin(time * .6 + index) * 6;
      const y = hash(seed, index, 4) * number(region.height, 48) * TILE + Math.cos(time * .8 + index) * 4;
      const brightness = (Math.sin(time * 1.5 + index * 2) + 1) / 2;
      if (brightness > .5) {
        rect(ctx, 'rgba(223,212,133,.13)', x - 1, y - 1, 3, 3);
        rect(ctx, brightness > .8 ? '#d9cf8b' : '#91a57a', x, y, 1, 1);
      }
    }
  }

  _targets(ctx, state, region, time) {
    const player = state.player || { x: 32, y: 24 };
    const targets = [];
    for (const npc of region.npcs || []) targets.push({ id: npc.id, kind: 'npc', label: npc.name, x: number(npc.x), y: number(npc.y), markerY: number(npc.y) * TILE - 28, object: npc });
    for (const object of region.objects || []) {
      if (!object.interactive) continue;
      const box = footprint(object);
      const x = (box.x + box.w / 2) / TILE, y = (box.y + box.h) / TILE;
      targets.push({ id: object.id, kind: 'object', label: object.label || object.type, x, y, markerY: box.y - (object.type === 'tower' ? 40 : 10), bounds: box, object });
    }
    const bounds = this.canvas.getBoundingClientRect();
    this.visibleTargets = targets.filter(target => {
      const sx = target.x * TILE - this.camera.x, sy = target.y * TILE - this.camera.y;
      return sx >= -20 && sx < this.canvas.width + 20 && sy >= -20 && sy < this.canvas.height + 30;
    }).map(target => ({ ...target, screenX: bounds.left + (target.x * TILE - this.camera.x) * bounds.width / this.canvas.width, screenY: bounds.top + (target.y * TILE - this.camera.y) * bounds.height / this.canvas.height }));
    let nearest = null, distance = 3.2;
    for (const target of targets) {
      const bounds = target.bounds;
      const current = bounds
        ? Math.hypot(number(player.x) - clamp(number(player.x), bounds.x / TILE, (bounds.x + bounds.w) / TILE), number(player.y) - clamp(number(player.y), bounds.y / TILE, (bounds.y + bounds.h) / TILE))
        : Math.hypot(target.x - number(player.x), target.y - number(player.y));
      if (current < distance) { distance = current; nearest = target; }
    }
    if (!nearest) return;
    const x = nearest.x * TILE, y = Math.min(nearest.markerY, nearest.y * TILE - 28) + Math.round(Math.sin(time * 3) * 1);
    rect(ctx, '#314c40', x - 6, y - 5, 12, 12);
    rect(ctx, '#d7cf9c', x - 5, y - 6, 10, 11);
    rect(ctx, '#f0e5ba', x - 4, y - 5, 8, 1);
    rect(ctx, '#465b43', x - 2, y - 3, 4, 1);
    rect(ctx, '#465b43', x - 2, y - 2, 1, 5);
    rect(ctx, '#465b43', x - 2, y, 3, 1);
    rect(ctx, '#465b43', x - 2, y + 2, 4, 1);
    rect(ctx, '#d7cf9c', x - 1, y + 5, 2, 2);
  }

  dispose() { this._resizeObserver?.disconnect(); this._grounds.clear(); }
}

export function drawMinimap(canvas, state = {}, region = {}) {
  if (!canvas?.getContext) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const width = number(region.width, 64), height = number(region.height, 48);
  const scale = Math.min(canvas.width / width, canvas.height / height);
  const offsetX = Math.floor((canvas.width - width * scale) / 2), offsetY = Math.floor((canvas.height - height * scale) / 2);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  rect(ctx, '#294b41', 0, 0, canvas.width, canvas.height);
  const palette = { grass: '#57775c', flowers: '#71886b', path: '#b1a57b', sand: '#b9ab80', stone: '#99a084', water: '#3b7473' };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) rect(ctx, palette[terrainAt(region, x, y)] || palette.grass, offsetX + x * scale, offsetY + y * scale, Math.ceil(scale), Math.ceil(scale));
  for (const object of region.objects || []) {
    if (object.type === 'tree') continue;
    const box = footprint(object);
    rect(ctx, object.type === 'tower' ? '#dbbf79' : '#bdac7d', offsetX + box.x / TILE * scale, offsetY + box.y / TILE * scale, box.w / TILE * scale, box.h / TILE * scale);
  }
  for (const npc of region.npcs || []) rect(ctx, '#d6d3a4', offsetX + number(npc.x) * scale, offsetY + number(npc.y) * scale, 2, 2);
  const player = state.player || { x: width / 2, y: height / 2 };
  const px = offsetX + number(player.x) * scale, py = offsetY + number(player.y) * scale;
  rect(ctx, '#284739', px - 2, py - 2, 5, 5);
  rect(ctx, '#fff0bc', px - 1, py - 1, 3, 3);
}
