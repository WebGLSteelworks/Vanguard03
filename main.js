import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.176.0/+esm';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.176.0/examples/jsm/controls/OrbitControls.js/+esm';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.176.0/examples/jsm/loaders/GLTFLoader.js/+esm';
import { EXRLoader } from 'https://cdn.jsdelivr.net/npm/three@0.176.0/examples/jsm/loaders/EXRLoader.js/+esm';

import { MODEL_CONFIG as BLACK_PRIZM_ROAD } from './configs/black_prizm_road.js';
import { MODEL_CONFIG as WHITE_PRIZM_SAPPHIRE } from './configs/white_prizm_sapphire.js';
import { MODEL_CONFIG as BLACK_PRIZM_24K } from './configs/black_prizm_24k.js';
import { MODEL_CONFIG as WHITE_PRIZM_BLACK } from './configs/white_prizm_black.js';

// ─────────────────────────────────────────────
// GLOBAL VAR
// ─────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf2f2f2); 

let logoTexture = null;
const textureLoader = new THREE.TextureLoader();

const gradientTexture = textureLoader.load('./textures/w_lens_gradient.jpg');
gradientTexture.flipY = false;
gradientTexture.colorSpace = THREE.SRGBColorSpace;

const cameras = {};

const clock = new THREE.Clock();

let currentConfig = BLACK_PRIZM_ROAD;
let currentModel = null;
const loader = new GLTFLoader();

let glassAnimationEnabled = true;
let activeCameraName = null;
let glassAnimateCamera = null;
let wasAnimatingGlass = false;

const REFLECTION_TINT = 1.1;    // dark glass
const REFLECTION_CLEAR = 0.18;  // trans glass

const glassMaterials = [];
const originalGlassColors = [];
const originalGlassOpacities = [];
let armsTextMeshes = [];





// ─────────────────────────────
// UI FOR MODEL SELECTION
// ─────────────────────────────

const modelUI = document.createElement('div');
modelUI.style.position = 'fixed';
modelUI.style.right = '20px';
modelUI.style.top = '50%';
modelUI.style.transform = 'translateY(-50%)';
modelUI.style.display = 'flex';
modelUI.style.flexDirection = 'column';
modelUI.style.gap = '10px';
modelUI.style.zIndex = '20';

document.body.appendChild(modelUI);

function makeModelButton(label, config) {
  const btn = document.createElement('button');
  btn.textContent = label;

  btn.style.padding = '10px 16px';
  btn.style.border = 'none';
  btn.style.borderRadius = '6px';
  btn.style.cursor = 'pointer';
  btn.style.background = '#222';
  btn.style.color = '#fff';
  btn.style.fontSize = '14px';

  btn.onclick = () => {
    currentConfig = config;
    applyConfig(config);
  };

  modelUI.appendChild(btn);
}

makeModelButton('Black Prizm Road', BLACK_PRIZM_ROAD);
makeModelButton('White Prizm Sapphire', WHITE_PRIZM_SAPPHIRE);
makeModelButton('Black Prizm 24k', BLACK_PRIZM_24K);
makeModelButton('White Prizm Black', WHITE_PRIZM_BLACK);

// ─────────────────────────────
// POSTPRODUCTION FOR MORE CONTRAST
// ─────────────────────────────

const ContrastShader = {
  uniforms: {
    tDiffuse: { value: null },
    contrast: { value: 2.0 } // 1.0 = neutro
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float contrast;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      color.rgb = (color.rgb - 0.5) * contrast + 0.5;
      gl_FragColor = color;
    }
  `
};


// ─────────────────────────────
// LOAD GLB MODEL
// ─────────────────────────────

function loadModel(config) {
	
  glassAnimationEnabled = config.glass.animate === true;
  glassAnimateCamera = config.glass.animateCamera || null;
  
  if (config.logo?.texture) {
	  logoTexture = textureLoader.load(config.logo.texture);
	  logoTexture.flipY = false;
	  logoTexture.colorSpace = THREE.SRGBColorSpace;
	}

  // ───── clean last model
  if (currentModel) {
    scene.remove(currentModel);
    currentModel.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }

  // state reset
  glassMaterials.length = 0;
  originalGlassColors.length = 0;
  armsTextMeshes.length = 0;
  glassAnim.state = 'waitGreen';
  glassAnim.timer = 0;
  Object.keys(cameraTargets).forEach(k => delete cameraTargets[k]);

  loader.load(config.glb, (gltf) => {

    currentModel = gltf.scene;
    scene.add(currentModel);
	
	// ───── calculate model pivot
	const box = new THREE.Box3().setFromObject(currentModel);
	const modelCenter = new THREE.Vector3();
	box.getCenter(modelCenter);


    // ───── load cameras
    gltf.scene.traverse(obj => {
			
      if (obj.isCamera) {

		  const pos = obj.getWorldPosition(new THREE.Vector3());
		  const quat = obj.getWorldQuaternion(new THREE.Quaternion());

		  const target =
			obj.name === 'Cam_Free'
			  ? modelCenter.clone()
			  : modelCenter.clone();

		  cameraTargets[obj.name] = {
			position: pos,
			quaternion: quat,
			target: modelCenter.clone(),
			fov: obj.getEffectiveFOV()
		  };
		}

		// ───── Apply same material to frame and arms
		if (
		  obj.isMesh &&
		  (
			obj.name.includes('frame') ||
			(obj.name.includes('Arm') && !obj.name.includes('Text'))
		  )
		) {
		  //obj.material = frameMaterial;
		}
			
		// ───── glass (principal)
		if (obj.isMesh && obj.material?.name?.toLowerCase().includes('glass')) {
			
		  obj.renderOrder = 2;

		  const mat = createGlassMaterial(obj.material, config);

		  glassMaterials.push(mat);
		  originalGlassColors.push(mat.color.clone());

		  obj.material = mat;
		}

		// ───── glassBack (capa interna)
		if (obj.isMesh && obj.name.toLowerCase().includes('glasback')) {

		  const backCfg = config.glass.back;

		  if (backCfg) {

			const backMat = new THREE.MeshPhysicalMaterial({
			  color: new THREE.Color(...backCfg.color),
			  transparent: true,
			  opacity: backCfg.opacity,
			  roughness: 0.15,
			  metalness: 0.0,
			  depthWrite: false
			});

			obj.material = backMat;
		  }
		}

		// ───── logo
		if (
		  config.logo?.texture &&
		  obj.isMesh &&
		  obj.name.toLowerCase().includes('logo')
		) {

		  const logoTex = textureLoader.load(config.logo.texture);
		  logoTex.flipY = false;
		  logoTex.colorSpace = THREE.SRGBColorSpace;

		  const logoMat = new THREE.MeshBasicMaterial({
			map: logoTex,
			transparent: true,
			depthWrite: false,
			toneMapped: false,
			opacity: 1.0
		  });

		  logoMat.depthTest = false;
		  obj.renderOrder = 10;

		  obj.material = logoMat;
		}

}); 

    // load starting camera
    smoothSwitchCamera(config.startCamera);
	applyConfig(config); 
  });
}


// ─────────────────────────────
// APPLY CONFIG SWAPPING MODELS 
// ─────────────────────────────
function applyConfig(config) {
	
	let frameMaterial;
	let armTextMaterial;
	const downColor = config.frame.downColor ?? config.frame.baseColor;
	const armTransparent = config.armsText.transparent === true;
	const armOpacity = config.armsText.opacity ?? 1.0;

	if (config.frame.trans) {

	  armTextMaterial = new THREE.MeshPhysicalMaterial({
		color: new THREE.Color(...downColor),
		roughness: config.frame.roughness,
		metalness: config.frame.metalness,
		transparent: true,
		opacity: config.frame.opacity ?? 0.6,
		depthWrite: false,
		envMapIntensity: 5.2,
		clearcoat: 5.0,
		clearcoatRoughness: config.frame.roughness
	  });

	} else {

	  armTextMaterial = new THREE.MeshStandardMaterial({
		  color: new THREE.Color(...downColor),
		  roughness: config.frame.roughness,
		  metalness: config.frame.metalness,

		  transparent: armTransparent,
		  opacity: armOpacity,

		  depthWrite: !armTransparent,
		  envMapIntensity: 2.2
	  });

	}	
	
	// ───── OVERLAY SHADER FOR ARM_TEXT
	const overlayTexture = textureLoader.load(config.armsText.overlay);
	overlayTexture.flipY = false;
	overlayTexture.colorSpace = THREE.SRGBColorSpace;

	armTextMaterial.onBeforeCompile = (shader) => {

	  shader.uniforms.overlayMap = { value: overlayTexture };
	  shader.uniforms.textColor = {
		value: new THREE.Color(...config.armsText.color)
	  };

	  // ───── VERTEX SHADER ─────
	  shader.vertexShader =
		`
		varying vec2 vCustomUv;
		` + shader.vertexShader;

	  shader.vertexShader = shader.vertexShader.replace(
		'#include <uv_vertex>',
		`
		  #include <uv_vertex>
		  vCustomUv = uv;
		`
	  );

	  // ───── FRAGMENT SHADER ─────
	  shader.fragmentShader =
		`
		uniform sampler2D overlayMap;
		uniform vec3 textColor;
		varying vec2 vCustomUv;
		` + shader.fragmentShader;

	  shader.fragmentShader = shader.fragmentShader.replace(
		'#include <color_fragment>',
		`
		  #include <color_fragment>

		  vec4 overlay = texture2D(overlayMap, vCustomUv);
		  float mask = overlay.a;

		  diffuseColor.rgb = mix(
			diffuseColor.rgb,
			textColor,
			mask
		  );

			diffuseColor.rgb = mix(
			  diffuseColor.rgb,
			  textColor,
			  mask
			);

		`
	  );
	};

	armTextMaterial.needsUpdate = true;

	if (config.frame.trans) {

		frameMaterial = new THREE.MeshPhysicalMaterial({
			color: new THREE.Color(...config.frame.baseColor),

			roughness: config.frame.roughness,
			metalness: 0.0,                     

			transparent: true,
			opacity: config.frame.opacity ?? 0.8,
			depthWrite: false,

			envMapIntensity: 3.5,              
			clearcoat: 1.0,
			clearcoatRoughness: config.frame.roughness,

			reflectivity: config.frame.reflectivity ?? 1.0
		});

	} else {

	  frameMaterial = new THREE.MeshStandardMaterial({
		color: new THREE.Color(...config.frame.baseColor),
		roughness: config.frame.roughness,
		metalness: config.frame.metalness
	  });

	}	

  glassAnimationEnabled = config.glass.animate === true;
  glassAnimateCamera = config.glass.animateCamera || null;

	// 🔹 LOGO
	if (config.logo?.texture) {
	  logoTexture = textureLoader.load(config.logo.texture);
	  logoTexture.flipY = false;
	  logoTexture.colorSpace = THREE.SRGBColorSpace;
	} else {
	  logoTexture = null;
	}

  // 🔹 FRAME (material update)
  currentModel.traverse(obj => {

    if (!obj.isMesh) return;

	if (obj.name.includes('Arm_Text')) {
	  obj.material = armTextMaterial;
	  obj.renderOrder = 1;
	  return;
	}

	if (obj.isMesh) {

	  const name = obj.name.toLowerCase();

	  // FRAME UP
	  if (name.includes('frame_up')) {

		const color = config.frame.upColor ?? config.frame.baseColor;

		const mat = frameMaterial.clone();
		mat.color.set(...color);

		obj.material = mat;
		return;
	  }

	  // FRAME DOWN
	  if (name.includes('frame_down')) {

		const color = config.frame.downColor ?? config.frame.baseColor;

		const mat = frameMaterial.clone();
		mat.color.set(...color);

		obj.material = mat;
		return;
	  }

	  // ARMS (sin texto)
	  if (
		name.includes('arm') &&
		!name.includes('text')
	  ) {
		obj.material = frameMaterial;
		return;
	  }
	}



  });


	// 🔹 FAKE INTERNAL MATERIAL
	if (config.fake?.texture) {

	  const fakeTexture = textureLoader.load(config.fake.texture);
	  fakeTexture.flipY = false;
	  fakeTexture.colorSpace = THREE.SRGBColorSpace;

	  currentModel.traverse(obj => {

		if (obj.isMesh && obj.material?.name?.toLowerCase() === 'fake') {

		  const fakeMaterial = new THREE.MeshStandardMaterial({
			map: fakeTexture,
			metalness: 0.0,
			roughness: 1.0
		  });

		  fakeMaterial.name = 'fake' ;

		  obj.material = fakeMaterial;

		}

	  });
	}


	// 🔹 ARM_TEXT (update)
	armsTextMeshes.forEach(mesh => {

	  // base color update
	  mesh.material.color.set(...downColor);

	  // properties update
	  mesh.material.roughness = config.frame.roughness;
	  mesh.material.metalness = config.frame.metalness;
	  
	  mesh.material.envMapIntensity = 2.2;
	  
	  if (config.frame.trans) {

		  mesh.material.transparent = true;
		  mesh.material.opacity = config.frame.opacity ?? 0.6;
		  mesh.material.depthWrite = false;

		} else {

		  mesh.material.transparent = false;
		  mesh.material.opacity = 1.0;
		  mesh.material.depthWrite = true;

		}

	  // text color update
	  if (mesh.material.userData.textColorUniform) {
		mesh.material.userData.textColorUniform.value.set(...config.armsText.color);
	  }

	});


  	// 🔹 GLASS
	glassMaterials.forEach(mat => {


	  mat.color.set(...config.glass.color);
	  mat.opacity = config.glass.opacity;

	  mat.alphaMap = config.glass.gradient ? gradientTexture : null;
	  
	  
	  
	  if (mat.userData.fresnel && config.glass.fresnel?.enabled) {

		  const f = config.glass.fresnel;

		  mat.userData.fresnel.intensity = f.intensity ?? 2.0;
		  mat.userData.fresnel.chromaBoost = f.chromaBoost ?? 0.8;

		  mat.userData.fresnel.colorFront.set(...f.colorFront);
		  mat.userData.fresnel.colorMid.set(...f.colorMid);
		  mat.userData.fresnel.colorEdge.set(...f.colorEdge);
		  
		  // ---- BASE CHROMA BOOST UPDATE ----
			mat.userData.baseChromaBoost = config.glass.baseChromaBoost ?? 1.0;

			// actualizar uniforms si el shader ya está compilado
			if (mat.userData.shader) {

			  mat.userData.shader.uniforms.fresnelIntensity.value =
				mat.userData.fresnel.intensity;

			  mat.userData.shader.uniforms.chromaBoost.value =
				mat.userData.fresnel.chromaBoost;

			  mat.userData.shader.uniforms.baseChromaBoost.value =
				mat.userData.baseChromaBoost;
			}
		  
		  if (mat.userData.fresnel && mat.userData.shader) {
			  mat.userData.shader.uniforms.chromaBoost.value =
				mat.userData.fresnel.chromaBoost;
			}

		}


	});

	// 🔹 GLASS BACK UPDATE
	if (config.glass.back) {

	  currentModel.traverse(obj => {

		if (
		  obj.isMesh &&
		  obj.name.toLowerCase().includes('glasback')
		) {

		  const backCfg = config.glass.back;

		  obj.material.color.set(...backCfg.color);
		  obj.material.opacity = backCfg.opacity;

		  obj.material.transparent = backCfg.opacity < 1.0;
		  obj.material.depthWrite = backCfg.opacity >= 1.0;

		  obj.material.needsUpdate = true;
		}
	  });

	}

}

// ─────────────────────────────
// GLASS FACTORY
// ─────────────────────────────

function createGlassMaterial(originalMaterial, config) {

  const g = config.glass;
  

  const mat = new THREE.MeshPhysicalMaterial({
	  
    color: new THREE.Color(...g.color),
    roughness: g.roughness,
    metalness: g.metalness ?? 0.0,

    transparent: true,
    opacity: g.opacity,

    transmission: 0.0,
    ior: g.ior ?? 2.0,
	reflectivity: 1.0,

    depthWrite: false,
    depthTest: true,

    envMapIntensity: 3.5,
	
	  // 🔥 COATING
	  clearcoat: 1.00,
	  clearcoatRoughness: 0.05
  });

	mat.userData.baseChromaBoost = g.baseChromaBoost ?? 1.0;

  // ───── OPACITY MAP
  if (g.opacityMap) {
    const alphaTex = textureLoader.load(g.opacityMap);
    alphaTex.flipY = false;
    alphaTex.colorSpace = THREE.NoColorSpace;
    mat.alphaMap = alphaTex;
  }

  // ───── GRADIENT
  if (g.gradientMap) {
    const gradientTex = textureLoader.load(g.gradientMap);
    gradientTex.flipY = false;
    gradientTex.colorSpace = THREE.SRGBColorSpace;
    mat.alphaMap = gradientTex;
  }

  // ───── FRESNEL EXTENSION
  if (g.fresnel?.enabled) {
    injectFresnel(mat, g.fresnel);
  }

  mat.needsUpdate = true;
  return mat;
}


// ─────────────────────────────
// GLASS FRESNEL (Inject)
// ─────────────────────────────

function injectFresnel(material, fresnelCfg) {
	
  material.userData.fresnel = {
    intensity: fresnelCfg.intensity ?? 2.0,
	chromaBoost: fresnelCfg.chromaBoost ?? 0.8, 
    colorFront: new THREE.Color(...fresnelCfg.colorFront),
    colorMid:   new THREE.Color(...fresnelCfg.colorMid),
    colorEdge:  new THREE.Color(...fresnelCfg.colorEdge)
  };

  material.onBeforeCompile = (shader) => {

    shader.uniforms.fresnelIntensity = { value: material.userData.fresnel.intensity };
    shader.uniforms.colorFront = { value: material.userData.fresnel.colorFront };
    shader.uniforms.colorMid   = { value: material.userData.fresnel.colorMid };
    shader.uniforms.colorEdge  = { value: material.userData.fresnel.colorEdge };
	shader.uniforms.chromaBoost = { value: material.userData.fresnel.chromaBoost };
	shader.uniforms.baseChromaBoost = { value: material.userData.baseChromaBoost ?? 1.0 };

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `
      #include <common>

      uniform float fresnelIntensity;
      uniform vec3 colorFront;
      uniform vec3 colorMid;
      uniform vec3 colorEdge;
	  uniform float chromaBoost;
	  uniform float baseChromaBoost;

      `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_end>',
      `
      #include <lights_fragment_end>

		// ---- BOOST COLOR BASE (diffuse + specular tint) ----
		float baseLum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
		vec3 baseChroma = diffuseColor.rgb - vec3(baseLum);
		vec3 boostedBase = vec3(baseLum) + baseChroma * baseChromaBoost;

		diffuseColor.rgb = boostedBase;

		// también tintamos ligeramente el specular indirecto
		reflectedLight.indirectSpecular.rgb *= boostedBase;

      float f = pow(
		  1.0 - dot(normalize(geometryNormal), normalize(vViewPosition)),
		  0.5
		);

		float frontMix = smoothstep(0.1, 0.35, f);
		float edgeMix  = smoothstep(0.6, 0.98, f);

		vec3 fresnelColor = mix(
		  colorFront,
		  mix(colorMid, colorEdge, edgeMix),
		  frontMix
		);

		// ---- SATURACIÓN INTELIGENTE ----

		// 1. Extraer luminancia
		float lum = dot(fresnelColor, vec3(0.299, 0.587, 0.114));

		// 2. Separar cromaticidad
		vec3 chroma = fresnelColor - vec3(lum);

		// 3. Reforzar solo la cromaticidad
		fresnelColor = vec3(lum) + chroma * chromaBoost;

		// ---- Aplicación controlada ----
		reflectedLight.indirectSpecular.rgb +=
		  fresnelColor * pow(f, 1.5) * fresnelIntensity;
			  `
    );
		material.userData.shader = shader;

  };


  material.needsUpdate = true;
}


// ─────────────────────────────
// GLASS ANIMATION
// ─────────────────────────────
const glassAnim = {
  state: 'waitGreen',
  timer: 0,

  duration: 1.5,
  waitGreen: 1.0,
  waitClear: 1.0
};



// ─────────────────────────────────────────────
// CAMERAS
// ─────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(
  80,
  window.innerWidth / window.innerHeight,
  0.01,
  1000
);

const cameraTargets = {};
let pendingFreeCamera = false;



// ─────────────────────────────────────────────
// ACTIVE CAMERA + TRANSITION STATE
// ─────────────────────────────────────────────

let transition = {
  active: false,
  startTime: 0,
  duration: 0.8,
  fromPos: new THREE.Vector3(),
  toPos: new THREE.Vector3(),
  fromQuat: new THREE.Quaternion(),
  toQuat: new THREE.Quaternion()
};



// ─────────────────────────────────────────────
// RENDERER
// ─────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.physicallyCorrectLights = true;

renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.6;

document.body.appendChild(renderer.domElement);


// ─────────────────────────────────────────────
// CONTROLS
// ─────────────────────────────────────────────
const controls = new OrbitControls(camera, renderer.domElement);
controls.enabled = false; 

controls.enableDamping = true;
controls.dampingFactor = 0.08;

controls.enableRotate = true;
controls.enableZoom = true;
controls.enablePan = false;

controls.minDistance = 0.5;
controls.maxDistance = 1.2;


// ─────────────────────────────────────────────
// LIGHTING
// ─────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffffff, 0.0));
const dirLight01 = new THREE.DirectionalLight(0xffffff, 0.0);
const dirLight02 = new THREE.DirectionalLight(0xffffff, 0.0);
dirLight01.position.set(5, 10, 7);
dirLight02.position.set(-10, 10, 7);
scene.add(dirLight01);
scene.add(dirLight02);

// ─────────────────────────────────────────────
// ENVIRONMENT
// ─────────────────────────────────────────────
const pmrem = new THREE.PMREMGenerator(renderer);

new EXRLoader().load('./studio.exr', (hdr) => {
	
  hdr.mapping = THREE.EquirectangularReflectionMapping;

  const tempScene = new THREE.Scene();

  const saturation = 0.0; // remove color from HDRI

  const material = new THREE.ShaderMaterial({
    uniforms: {
      tMap: { value: hdr },
	  saturation: { value: saturation },
	  contrast: { value: 1.60 } 
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tMap;
      uniform float saturation;
	  uniform float contrast;
      varying vec2 vUv;

      void main() {
        vec4 color = texture2D(tMap, vUv);

        float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        vec3 grey = vec3(luminance);

        color.rgb = mix(grey, color.rgb, saturation);
		
		color.rgb = (color.rgb - 0.5) * contrast + 0.5;

        gl_FragColor = color;
      }
    `,
    side: THREE.DoubleSide
  });

  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    material
  );

  tempScene.add(quad);

  const renderTarget = new THREE.WebGLRenderTarget(
    hdr.image.width,
    hdr.image.height
  );

  renderer.setRenderTarget(renderTarget);
  renderer.render(tempScene, new THREE.Camera());
  renderer.setRenderTarget(null);

  const processedEnvMap = pmrem.fromEquirectangular(renderTarget.texture).texture;

  scene.environment = processedEnvMap;
  scene.environmentRotation = new THREE.Euler(0, Math.PI * 0.5, 0);
  scene.environmentIntensity = 1.5;

  hdr.dispose();
  renderTarget.dispose();
});


// ─────────────────────────────────────────────
// SMOOTH SWITCH CAMERAS
// ─────────────────────────────────────────────
function smoothSwitchCamera(name) {
  activeCameraName = name;

  const camData = cameraTargets[name];
  if (!camData) return;

  // ───── CAM_FREE (NO TRANSITION)
  if (name === 'Cam_Free') {

    transition.active = false;

    camera.position.copy(camData.position);
    controls.target.copy(camData.target);

    camera.lookAt(controls.target);
    camera.updateMatrixWorld();

    controls.update();
    controls.enabled = true;

    return;
  }

  // ───── CAMERA TRANSITION
  controls.enabled = false; 
  
  if (camData.fov !== undefined) {
    camera.fov = camData.fov;
    camera.updateProjectionMatrix();
  }

  transition.fromPos.copy(camera.position);
  transition.fromQuat.copy(camera.quaternion);

  transition.toPos.copy(camData.position);
  transition.toQuat.copy(camData.quaternion);

  transition.startTime = performance.now();
  transition.active = true;
}


// ─────────────────────────────────────────────
// RESIZE
// ─────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─────────────────────────────────────────────
// LOOP ANIMATE
// ─────────────────────────────────────────────
function animate(time) {
  requestAnimationFrame(animate);

  // ─────────────────────────────────────────
  // CAMERA TRANSITIONS (Still Cameras)
  // ─────────────────────────────────────────
  if (transition.active) {

    const elapsed = (time - transition.startTime) / 1000;
    const t = Math.min(elapsed / transition.duration, 1);
    const ease = t * t * (3 - 2 * t);

    camera.position.lerpVectors(
      transition.fromPos,
      transition.toPos,
      ease
    );

    if (activeCameraName !== 'Cam_Free') {
      camera.quaternion
        .copy(transition.fromQuat)
        .slerp(transition.toQuat, ease);
    }

    if (t >= 1) {
      transition.active = false;
    }
  }

  // ─────────────────────────────────────────
  // ORBIT CONTROLS (only Cam_Free)
  // ─────────────────────────────────────────
  if (controls.enabled) {
    controls.update();
  }

  // ─────────────────────────────────────────
  // GLASS ANIMATION (controlled by config)
  // ─────────────────────────────────────────
  
  const shouldAnimateGlass =
    glassAnimationEnabled &&
    glassMaterials.length > 0 &&
    activeCameraName === glassAnimateCamera;

  if (shouldAnimateGlass) {

    wasAnimatingGlass = true;

    const delta = clock.getDelta();
    glassAnim.timer += delta;

    glassMaterials.forEach((mat, i) => {

      const originalColor = originalGlassColors[i];

      switch (glassAnim.state) {

        case 'waitGreen':
          if (glassAnim.timer > glassAnim.waitGreen) {
            glassAnim.timer = 0;
            glassAnim.state = 'toClear';
          }
          break;

        case 'toClear': {
          const t = Math.min(glassAnim.timer / glassAnim.duration, 1);
          const ease = t * t * (3 - 2 * t);

          mat.color.lerpColors(
            originalColor,
            new THREE.Color(1, 1, 1),
            ease
          );

		  mat.opacity = THREE.MathUtils.lerp(
			originalGlassOpacities[i],
			0.0,
			ease
		  );

          if (t >= 1) {
            glassAnim.timer = 0;
            glassAnim.state = 'waitClear';
          }
          break;
        }

        case 'waitClear':
          if (glassAnim.timer > glassAnim.waitClear) {
            glassAnim.timer = 0;
            glassAnim.state = 'toGreen';
          }
          break;

        case 'toGreen': {
          const t = Math.min(glassAnim.timer / glassAnim.duration, 1);
          const ease = t * t * (3 - 2 * t);

          mat.color.lerpColors(
            new THREE.Color(1, 1, 1),
            originalColor,
            ease
          );

		  mat.opacity = THREE.MathUtils.lerp(
			0.0,
			originalGlassOpacities[i],
			ease
		  );


          if (t >= 1) {
            glassAnim.timer = 0;
            glassAnim.state = 'waitGreen';
          }
          break;
        }
      }
    });

  } else {

    // Reset ONLY when leave animate
    if (wasAnimatingGlass) {
      glassMaterials.forEach((mat, i) => {
        mat.color.copy(originalGlassColors[i]);
		mat.opacity = originalGlassOpacities[i];
      });

      glassAnim.state = 'waitGreen';
      glassAnim.timer = 0;
      wasAnimatingGlass = false;
    }
  }

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────
  renderer.render(scene, camera);
}


// ─────────────────────────────────────────────
// CAMERA BUTTONS UI
// ─────────────────────────────────────────────
const ui = document.createElement('div');
ui.style.position = 'fixed';
ui.style.bottom = '20px';
ui.style.left = '50%';
ui.style.transform = 'translateX(-50%)';
ui.style.display = 'flex';
ui.style.gap = '10px';
ui.style.zIndex = '10';

document.body.appendChild(ui);

const cameraButtons = [
  { label: 'Front', name: 'Cam_Front' },
  { label: 'Side', name: 'Cam_Side' },
  { label: 'Camera', name: 'Cam_Camera' },
  { label: 'Capture', name: 'Cam_Capture' },
  { label: 'Power', name: 'Cam_Power' },
  { label: 'Lenses', name: 'Cam_Lenses' },
  { label: 'Free', name: 'Cam_Free' }
];

cameraButtons.forEach(({ label, name }) => {
  const btn = document.createElement('button');
  btn.textContent = label;

  btn.style.padding = '8px 14px';
  btn.style.border = 'none';
  btn.style.borderRadius = '6px';
  btn.style.cursor = 'pointer';
  btn.style.background = '#111';
  btn.style.color = '#fff';
  btn.style.fontSize = '13px';

  btn.addEventListener('click', () => smoothSwitchCamera(name));
  ui.appendChild(btn);
});


loadModel(currentConfig);
animate();




















