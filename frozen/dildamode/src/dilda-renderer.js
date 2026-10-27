import voxels from "./dilda-voxels.json";

// The held item and projectiles use real depth-tested geometry, without a runtime dependency.
function cube(vertices, x, y, z, size, rgb) {
  const faces = [
    [
      [0, 0, 1],
      [
        [0, 0, 1],
        [1, 0, 1],
        [1, 1, 1],
        [0, 1, 1],
      ],
    ],
    [
      [0, 0, -1],
      [
        [1, 0, 0],
        [0, 0, 0],
        [0, 1, 0],
        [1, 1, 0],
      ],
    ],
    [
      [1, 0, 0],
      [
        [1, 0, 1],
        [1, 0, 0],
        [1, 1, 0],
        [1, 1, 1],
      ],
    ],
    [
      [-1, 0, 0],
      [
        [0, 0, 0],
        [0, 0, 1],
        [0, 1, 1],
        [0, 1, 0],
      ],
    ],
    [
      [0, 1, 0],
      [
        [0, 1, 1],
        [1, 1, 1],
        [1, 1, 0],
        [0, 1, 0],
      ],
    ],
    [
      [0, -1, 0],
      [
        [0, 0, 0],
        [1, 0, 0],
        [1, 0, 1],
        [0, 0, 1],
      ],
    ],
  ];
  for (const [normal, points] of faces)
    for (const index of [0, 1, 2, 0, 2, 3]) {
      const p = points[index];
      vertices.push(
        x + p[0] * size,
        y + p[1] * size,
        z + p[2] * size,
        ...normal,
        ...rgb,
      );
    }
}
function modelGeometry() {
  const v = [];
  for (const [x, y, r, g, b] of voxels)
    cube(v, (x - 12) * 0.065, (15 - y) * 0.065, -0.12, 0.065, [
      r / 255,
      g / 255,
      b / 255,
    ]);
  return v;
}
function tomatoGeometry() {
  const v = [],
    segments = 12,
    rings = 8;
  const point = (ring, s) => {
    const a = (ring / rings) * Math.PI,
      b = (s / segments) * Math.PI * 2;
    return [
      Math.sin(a) * Math.cos(b) * 0.45,
      Math.cos(a) * 0.36,
      Math.sin(a) * Math.sin(b) * 0.45,
    ];
  };
  for (let r = 0; r < rings; r++)
    for (let s = 0; s < segments; s++) {
      const p = [
        point(r, s),
        point(r + 1, s),
        point(r + 1, s + 1),
        point(r, s + 1),
      ];
      for (const i of [0, 1, 2, 0, 2, 3]) {
        const n = p[i].map((c, j) => c / (j === 1 ? 0.36 : 0.45));
        v.push(...p[i], ...n, 0.87, 0.12 + (s % 3) * 0.025, 0.09);
      }
    }
  // Five blocky green leaves and a little stem keep the tomato legible at low resolution.
  cube(v, -0.045, 0.32, -0.045, 0.09, [0.16, 0.36, 0.12]);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    cube(
      v,
      Math.cos(a) * 0.17 - 0.06,
      0.29,
      Math.sin(a) * 0.17 - 0.06,
      0.12,
      [0.23, 0.43, 0.12],
    );
  }
  return v;
}
export function createDildaRenderer(canvas, onUnavailable) {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: true,
    premultipliedAlpha: false,
  });
  if (!gl) {
    onUnavailable();
    return null;
  }
  const shader = (type, source) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error("3D shader unavailable");
    return s;
  };
  const vert = shader(
    gl.VERTEX_SHADER,
    `
    attribute vec3 aPosition; attribute vec3 aNormal; attribute vec3 aColor;
    uniform vec3 uTranslate; uniform float uScale; uniform float uRotation;
    uniform float uAspect; varying vec3 vColor;
    void main() {
      float c=cos(uRotation), s=sin(uRotation);
      mat3 rotate=mat3(c,s,0.,-s,c,0.,0.,0.,1.);
      mat3 tilt=mat3(.94,0.,.34,0.,1.,0.,-.34,0.,.94);
      vec3 p=tilt*rotate*aPosition*uScale+uTranslate;
      vec3 n=normalize(tilt*rotate*aNormal);
      float light=.53+.47*max(0.,dot(n,normalize(vec3(-.5,.9,1.))));
      vColor=aColor*light;
      gl_Position=vec4(p.x*2.14/uAspect,p.y*2.14,-1.002*p.z-.2002,-p.z);
    }
  `,
  );
  const frag = shader(
    gl.FRAGMENT_SHADER,
    `precision mediump float; varying vec3 vColor; void main(){gl_FragColor=vec4(vColor,1.);}`,
  );
  const program = gl.createProgram();
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error("3D program unavailable");
  gl.useProgram(program);
  gl.enable(gl.DEPTH_TEST);
  const buffers = [modelGeometry(), tomatoGeometry()].map((data) => {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    return { buffer, count: data.length / 9 };
  });
  const attrs = ["aPosition", "aNormal", "aColor"].map((name) =>
    gl.getAttribLocation(program, name),
  );
  attrs.forEach((a) => gl.enableVertexAttribArray(a));
  const uniforms = Object.fromEntries(
    ["Translate", "Scale", "Rotation", "Aspect"].map((n) => [
      n,
      gl.getUniformLocation(program, `u${n}`),
    ]),
  );
  let item = 0,
    aim = { x: 0.5, y: 0.5 },
    recoil = 0,
    shots = [],
    frame = 0,
    disposed = false;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function draw(which, position, scale, rotation) {
    const data = buffers[which];
    gl.bindBuffer(gl.ARRAY_BUFFER, data.buffer);
    attrs.forEach((a, i) =>
      gl.vertexAttribPointer(a, 3, gl.FLOAT, false, 36, i * 12),
    );
    gl.uniform3fv(uniforms.Translate, position);
    gl.uniform1f(uniforms.Scale, scale);
    gl.uniform1f(uniforms.Rotation, rotation);
    gl.drawArrays(gl.TRIANGLES, 0, data.count);
  }
  function render(now) {
    if (disposed) return;
    const dpr = Math.min(devicePixelRatio || 1, 2),
      w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (
      canvas.width !== Math.round(w * dpr) ||
      canvas.height !== Math.round(h * dpr)
    ) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const aspect = w / h;
    gl.uniform1f(uniforms.Aspect, aspect);
    const kick = reduced ? 0 : Math.max(0, 1 - (now - recoil) / 180);
    const held = [
      aspect * 0.83 + (aim.x - 0.5) * 0.08,
      -1.0 + (aim.y - 0.5) * -0.05 - kick * 0.08,
      -2.7 + kick * 0.14,
    ];
    draw(item, held, item === 0 ? 0.85 : 1.25, -0.13 - kick * 0.12);
    shots = shots.filter((shot) => now - shot.at < 320);
    for (const shot of shots) {
      const t = Math.min(1, (now - shot.at) / 320),
        ease = 1 - (1 - t) * (1 - t);
      const target = [
        ((shot.x * 2 - 1) * 7 * aspect) / 2.14,
        ((1 - shot.y * 2) * 7) / 2.14,
        -7,
      ];
      draw(
        shot.item,
        held.map((value, i) => value + (target[i] - value) * ease),
        shot.item === 0 ? 0.32 : 0.55,
        shot.item === 0 ? -0.25 : ease * 4,
      );
    }
    // Draw on demand; the isolated mode has no background render loop while idle or closed.
    if (shots.length || kick > 0) frame = requestAnimationFrame(render);
    else frame = 0;
  }
  const refresh = () => {
    if (!frame && !disposed) frame = requestAnimationFrame(render);
  };
  const resize = new ResizeObserver(refresh);
  resize.observe(canvas);
  const lost = (e) => {
    e.preventDefault();
    onUnavailable();
  };
  canvas.addEventListener("webglcontextlost", lost);
  refresh();
  return {
    setItem(value) {
      item = value === "tomato" ? 1 : 0;
      refresh();
    },
    aim(x, y) {
      aim = { x, y };
      refresh();
    },
    shoot(x, y) {
      recoil = performance.now();
      shots.push({ at: recoil, x, y, item });
      shots = shots.slice(-32);
      refresh();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      canvas.removeEventListener("webglcontextlost", lost);
      buffers.forEach(({ buffer }) => gl.deleteBuffer(buffer));
      gl.deleteProgram(program);
      gl.deleteShader(vert);
      gl.deleteShader(frag);
    },
  };
}
