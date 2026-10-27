const vertex = `attribute vec2 aPosition;
varying vec2 vUv;
void main() { vUv = aPosition * .5 + .5; gl_Position = vec4(aPosition, 0., 1.); }`;
const fragment = `precision mediump float;
uniform sampler2D uPaper;
uniform float uProgress;
uniform float uTime;
uniform float uReveal;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1.)), f.x), f.y);
}
float fbm(vec2 p) {
  float n = 0., a = .5;
  for (int i = 0; i < 4; i++) { n += noise(p) * a; p = p * 2.03 + 7.1; a *= .5; }
  return n;
}
void main() {
  float grain = fbm(vUv * 7.);
  float front = uProgress * 1.55 - .25;
  float edge = vUv.y + (grain - .5) * .3 + vUv.x * .08 - front;
  vec4 paper = texture2D(uPaper, vUv);
  if (uReveal > .5) {
    float dissolve = mix(-.08, 1.08, uProgress) - (grain * .7 + vUv.y * .3);
    gl_FragColor = vec4(paper.rgb, paper.a * smoothstep(-.025, .025, dissolve));
    return;
  }
  float intact = smoothstep(-.006, .006, edge);
  float scorch = 1. - smoothstep(.01, .09, edge);
  vec3 color = mix(paper.rgb, vec3(.055, .025, .012) + grain * .04, scorch);
  float ember = (1. - smoothstep(.005, .035, abs(edge))) * (.72 + .28 * noise(vUv * 90. + uTime * 5.));
  color = mix(color, mix(vec3(1., .18, .015), vec3(1., .85, .25), ember), ember);
  float plume = fbm(vec2(vUv.x * 24., vUv.y * 13. - uTime * 4.));
  float flame = (1. - smoothstep(.0, .12 + plume * .12, max(edge, 0.))) * smoothstep(-.035, .005, edge);
  flame *= smoothstep(.2, .65, plume) * smoothstep(.0, .06, uProgress);
  vec3 fire = mix(vec3(1., .13, .008), vec3(1., .78, .16), smoothstep(.35, .8, plume));
  color = mix(color, fire, flame * .85);
  float smoke = (1. - intact) * smoothstep(-.18, -.015, edge) * fbm(vUv * 12. - vec2(0., uTime)) * .22;
  gl_FragColor = vec4(mix(vec3(.23), color, intact), max(intact, smoke) * (1. - smoothstep(.93, 1., uProgress)));
}`;

// A single texture/quad at <=1024px and 30fps; release every GPU object when done.
export function animateBurningPaper(canvas, paper, onDone) {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
    powerPreference: "low-power",
  });
  if (!gl) return null;
  const shaders = [],
    resources = [];
  let program,
    buffer,
    texture,
    frame,
    stopped = false,
    phaseDone = onDone;
  const dispose = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    canvas.removeEventListener("webglcontextlost", lost);
    resources.forEach(([kind, object]) => gl[kind](object));
    shaders.forEach((shader) => gl.deleteShader(shader));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  };
  const lost = (event) => {
    event.preventDefault();
    dispose();
    phaseDone();
  };
  try {
    const shader = (type, source) => {
      const value = gl.createShader(type);
      shaders.push(value);
      gl.shaderSource(value, source);
      gl.compileShader(value);
      if (!gl.getShaderParameter(value, gl.COMPILE_STATUS))
        throw new Error("shader");
      return value;
    };
    program = gl.createProgram();
    resources.push(["deleteProgram", program]);
    gl.attachShader(program, shader(gl.VERTEX_SHADER, vertex));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error("program");
    gl.useProgram(program);
    buffer = gl.createBuffer();
    resources.push(["deleteBuffer", buffer]);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    texture = gl.createTexture();
    resources.push(["deleteTexture", texture]);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, paper);
    gl.uniform1i(gl.getUniformLocation(program, "uPaper"), 0);
    const progress = gl.getUniformLocation(program, "uProgress"),
      reveal = gl.getUniformLocation(program, "uReveal"),
      time = gl.getUniformLocation(program, "uTime");
    const scale = Math.min(1, 1024 / Math.max(paper.width, paper.height));
    canvas.width = Math.round(paper.width * scale);
    canvas.height = Math.round(paper.height * scale);
    gl.viewport(0, 0, canvas.width, canvas.height);
    canvas.addEventListener("webglcontextlost", lost);
    const play = (duration) => {
      const start = performance.now();
      let previous = -Infinity;
      const draw = (now) => {
        if (stopped) return;
        const elapsed = now - start;
        if (now - previous >= 32 || elapsed >= duration) {
          previous = now;
          gl.uniform1f(progress, Math.min(1, elapsed / duration));
          gl.uniform1f(time, elapsed / 1000);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
        if (elapsed >= duration) phaseDone();
        else frame = requestAnimationFrame(draw);
      };
      draw(start);
    };
    play(2500);
    return {
      dispose,
      reveal(paper, complete) {
        if (stopped) {
          complete();
          return;
        }
        phaseDone = complete;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          paper,
        );
        gl.uniform1f(reveal, 1);
        play(850);
      },
    };
  } catch {
    dispose();
    return null;
  }
}
