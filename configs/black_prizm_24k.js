export const MODEL_CONFIG = {
  name: 'Black Prizm 24k',
  glb: './models/Standard_Vanguard.glb',

	frame: {
	  baseColor: [0.06, 0.06, 0.06],
	  
	  upColor:   [0.06, 0.06, 0.06],   
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
	  color: [0.9, 0.5, 0.2],   
	  roughness: 0.05,
	  metalness: 0.5,
	  opacity: 0.9,

	  fresnel: {
		enabled: true,
		intensity: 2.0,
		chromaBoost: 2.5,
		colorFront: [0.9, 0.5, 0.2],
		colorMid:   [0.6, 0.3, 0.1],
		colorEdge:  [0.2, 0.5, 0.1]
	  },

	  baseChromaBoost: 1.0, 
	  
	  back: {
		color: [0.40, 0.25, 0.15],
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