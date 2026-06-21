/* ============================================================
   WebGL hover distortion  (three.js)
   A single transparent fixed canvas. On hover of a .media whose
   image has loaded, a textured plane is synced to its rect and
   given a ripple + RGB-split that follows the cursor.
   Pure progressive enhancement — the page works without it.
   ============================================================ */
import * as THREE from '../vendor/three.module.min.js';

const VERT = `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`;

const FRAG = `
  precision highp float;
  uniform sampler2D uTex;
  uniform float uHover, uTime;
  uniform vec2  uMouse, uCover;
  varying vec2  vUv;
  void main(){
    vec2 uv = (vUv - 0.5) * uCover + 0.5;
    float d   = distance(vUv, uMouse);
    float ring = smoothstep(0.48, 0.0, d) * uHover;
    vec2  dir = normalize(vUv - uMouse + 1e-4);
    float wave = sin(d * 20.0 - uTime * 4.5) * 0.012 * ring;
    vec2  off  = dir * wave;
    float s    = 0.014 * ring;
    float r = texture2D(uTex, uv + off + dir * s).r;
    float g = texture2D(uTex, uv + off).g;
    float b = texture2D(uTex, uv + off - dir * s).b;
    vec3  col = vec3(r, g, b) + ring * 0.05;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function initWebGL(){
  const items = [...document.querySelectorAll('.media')].filter(m => m.querySelector('.media__img'));
  if(!items.length) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'webgl-canvas';
  Object.assign(canvas.style,{position:'fixed',inset:'0',width:'100%',height:'100%',
    pointerEvents:'none',zIndex:'40'});

  const renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:true, premultipliedAlpha:false });
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setClearColor(0x000000, 0);
  if('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(canvas);

  let W = innerWidth, H = innerHeight;
  const camera = new THREE.OrthographicCamera(0, W, 0, -H, 0.1, 100);
  camera.position.z = 10;
  const scene  = new THREE.Scene();

  const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
  const uniforms = {
    uTex:{value:null}, uHover:{value:0}, uTime:{value:0},
    uMouse:{value:new THREE.Vector2(0.5,0.5)}, uCover:{value:new THREE.Vector2(1,1)}
  };
  const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    vertexShader:VERT, fragmentShader:FRAG, uniforms, transparent:true
  }));
  mesh.visible = false;
  scene.add(mesh);

  const loader = new THREE.TextureLoader();
  const texCache = new Map();
  function textureFor(img){
    const src = img.currentSrc || img.src;
    if(texCache.has(src)) return texCache.get(src);
    const t = loader.load(src);
    t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.generateMipmaps = false;
    if('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(src, t); return t;
  }
  // warm the cache so the first hover never flashes
  items.forEach(m=>{ const i=m.querySelector('.media__img'); if(i && i.dataset.ready==='1') textureFor(i); });

  let active = null, hoverTarget = 0, running = false, raf = 0;
  const mouse = new THREE.Vector2(0.5,0.5);

  function setActive(media){
    const img = media.querySelector('.media__img');
    if(!img || img.dataset.ready !== '1') return;       // skip missing/placeholder
    active = media;
    uniforms.uTex.value = textureFor(img);
    const tw = img.naturalWidth, th = img.naturalHeight;
    const r = media.getBoundingClientRect();
    const boxA = r.width / r.height, texA = tw / th;
    uniforms.uCover.value.set(
      texA > boxA ? boxA / texA : 1,
      texA > boxA ? 1 : texA / boxA
    );
    mesh.visible = true;
    if(!running) loop();
  }

  function sync(){
    if(!active) return;
    const r = active.getBoundingClientRect();
    mesh.scale.set(r.width, r.height, 1);
    mesh.position.set(r.left + r.width/2, -(r.top + r.height/2), 0);
  }

  function loop(){
    running = true;
    raf = requestAnimationFrame(loop);
    uniforms.uTime.value += 0.016;
    uniforms.uHover.value += (hoverTarget - uniforms.uHover.value) * 0.08;
    uniforms.uMouse.value.x += (mouse.x - uniforms.uMouse.value.x) * 0.1;
    uniforms.uMouse.value.y += (mouse.y - uniforms.uMouse.value.y) * 0.1;
    sync();
    renderer.render(scene, camera);
    if(hoverTarget === 0 && uniforms.uHover.value < 0.001){
      running = false; mesh.visible = false; cancelAnimationFrame(raf); return;
    }
  }

  items.forEach(media=>{
    media.addEventListener('mouseenter', ()=>{ setActive(media); hoverTarget = 1; });
    media.addEventListener('mouseleave', ()=>{ hoverTarget = 0; });
    media.addEventListener('mousemove', e=>{
      const r = media.getBoundingClientRect();
      mouse.set((e.clientX-r.left)/r.width, 1-(e.clientY-r.top)/r.height);
    });
  });

  addEventListener('resize', ()=>{
    W = innerWidth; H = innerHeight;
    renderer.setSize(W, H, false);
    camera.right = W; camera.bottom = -H; camera.updateProjectionMatrix();
  });
  renderer.setSize(W, H, false);
}
