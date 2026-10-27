import { useEffect } from "react";

const SESSION = "tyter.dildamode.first-click-wave.v1";
// A transparent shader layer leaves the live document and its input untouched.
export default function FirstClickWave() {
  useEffect(() => {
    let played = false,
      canvas,
      gl,
      frame,
      program,
      buffer;
    try {
      played = sessionStorage.getItem(SESSION) === "1";
    } catch {
      /* Tab-local fallback. */
    }
    const cleanup = () => {
      cancelAnimationFrame(frame);
      if (gl) {
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
      }
      canvas?.remove();
    };
    const start = (event) => {
      if (played || event.button !== 0) return;
      played = true;
      try {
        sessionStorage.setItem(SESSION, "1");
      } catch {
        /* Still runs only once on this page. */
      }
      document.removeEventListener("click", start, true);
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      canvas = document.createElement("canvas");
      canvas.className = "first-click-wave";
      canvas.setAttribute("aria-hidden", "true");
      Object.assign(canvas.style, {
        position: "fixed",
        inset: "0",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: "2147483647",
      });
      gl = canvas.getContext("webgl", {
        alpha: true,
        premultipliedAlpha: false,
        depth: false,
        antialias: false,
      });
      if (!gl) return;
      const shader = (type, source) => {
        const value = gl.createShader(type);
        gl.shaderSource(value, source);
        gl.compileShader(value);
        if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) {
          gl.deleteShader(value);
          return null;
        }
        return value;
      };
      const vertex = shader(
        gl.VERTEX_SHADER,
        "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}",
      );
      const fragment = shader(
        gl.FRAGMENT_SHADER,
        `precision mediump float;
        uniform vec2 size, origin; uniform float time;
        void main(){
          float d=distance(gl_FragCoord.xy,origin)/length(size);
          float radius=1.12*(1.-pow(1.-time,2.));
          float width=.009+.018*time;
          float ring=exp(-pow((d-radius)/width,2.));
          float echo=exp(-pow((d-radius+.026)/(.018+time*.02),2.))*.35;
          vec3 color=mix(vec3(.67,.54,.98),vec3(.46,.86,.91),smoothstep(radius-.02,radius+.02,d));
          gl_FragColor=vec4(color,(ring+echo)*.32*pow(1.-time,1.1));
        }`,
      );
      if (!vertex || !fragment) {
        cleanup();
        return;
      }
      program = gl.createProgram();
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        cleanup();
        return;
      }
      gl.useProgram(program);
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW,
      );
      const p = gl.getAttribLocation(program, "p");
      gl.enableVertexAttribArray(p);
      gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(innerWidth * ratio);
      canvas.height = Math.round(innerHeight * ratio);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(
        gl.getUniformLocation(program, "size"),
        canvas.width,
        canvas.height,
      );
      gl.uniform2f(
        gl.getUniformLocation(program, "origin"),
        event.clientX * ratio,
        (innerHeight - event.clientY) * ratio,
      );
      const time = gl.getUniformLocation(program, "time"),
        began = performance.now();
      document.body.append(canvas);
      const paint = (now) => {
        const progress = Math.min(1, (now - began) / 1100);
        if (progress >= 1 || document.hidden || gl.isContextLost()) {
          cleanup();
          return;
        }
        gl.uniform1f(time, progress);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        frame = requestAnimationFrame(paint);
      };
      frame = requestAnimationFrame(paint);
    };
    if (!played) document.addEventListener("click", start, true);
    return () => {
      document.removeEventListener("click", start, true);
      cleanup();
    };
  }, []);
  return null;
}
