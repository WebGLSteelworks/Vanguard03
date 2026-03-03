export const MODEL_CONFIG = {
  name: 'White Prizm Sapphire',
  glb: './models/Standard_Vanguard.glb',

	frame: {
	  baseColor: [0.06, 0.06, 0.06],
	  
	  upColor:   [0.75, 0.75, 0.75],   
	  downColor: [0.06, 0.06, 0.06], 	
	  roughness: 0.5,
	  metalness: 0.0,
	  trans: false,          
	  opacity: 0.3, 
	  reflectivity: 1.0 			
	},
	
	armsText: {
		overlay: './textures/Temples_vanguard_2k.png',
		color: [0.2, 0.2, 0.2],
		
		transparent: true,
		opacity: 0.9,
	},

    glass: {
	  color: [0.30, 0.8, 1.0],   
	  roughness: 0.05,
	  metalness: 0.5,
	  opacity: 0.9,

	  fresnel: {
		enabled: true,
		intensity: 4.0,
		chromaBoost: 3,		
		colorFront: [0.30, 0.8, 1.0],
		colorMid:   [0.20, 0.2, 0.8],
		colorEdge:  [0.25, 0.0, 0.25]
	  },

	  baseChromaBoost: 2.0, 
	  
	  back: {
		color: [0.5, 0.2, 0.25],
		opacity: 1.0
	  },

	},

	fake: {
	  texture: './textures/v_interior_fake_blur.jpg'
	},

	logo: {
	  texture: './textures/prizm_logo_512k.png',
	  emissiveIntensity: 0.1
	},


  startCamera: 'Cam_Front',
  freeCamera: 'Cam_Free'
};