import * as wasm from './math.rs';

var vrDisplay;
var vrControls;
var arView;

var canvas;
var camera;
var scene;
var renderer;

let drawMode = 'TriangleStripDrawMode'
let btnPrefix = "drawMode: "
let btn = document.createElement('button')
btn.style.fontFamily = 'monospace'
btn.style.fontSize = '2em'
btn.style.backgroundColor = '#2EAFAC'
btn.style.border = '1px solid black'
btn.style.position = 'absolute'
btn.style.top = 0
btn.style.right = 0
btn.style.zIndex = 1
btn.innerText = `${btnPrefix}${drawMode}`

btn.onclick = e => {
  drawMode = (drawMode == 'TriangleStripDrawMode') ? 'TrianglesDrawMode' : 'TriangleStripDrawMode'
  btn.innerText = `${btnPrefix}${drawMode}`
}
// Uncomment this to add back in the option to toggle the strip mode:
// document.body.appendChild(btn)

var guiData = {
  isWireframe: false,
  applyVelocityMult: true,
  drawSpheres: false
};
var gui = new dat.GUI();
const keys = Object.keys(guiData);
  // Add all the keys in the map to the GUI
for (let i in keys) {
  gui.add(guiData, keys[i]);
}

let touchOffsetInfo = { x: 0, y: 0};

  function getRandomArbitrary(min, max) {
    return Math.random() * (max - min) + min;
  }


let particles = [];
class Particle {
  constructor(devicePos = new THREE.Vector3(0,0,0)) {
    this.vx = getRandomArbitrary(-1, 1) * 0.00005;
    this.vy = getRandomArbitrary(-2, 2) * 0.00005;
    this.alpha = 255;

    let geometry = new THREE.BoxGeometry(1,1,1);
    let material = new THREE.MeshBasicMaterial( { color: 0x2EAFAC, transparent: true } );
    let cube = new THREE.Mesh( geometry, material );
    cube.scale.multiplyScalar(0.005)
    cube.position.add(devicePos.clone())
    this.cube = cube
    scene.add(cube)
  }

  finished() {
    return this.alpha < 0;
  }

  update() {
   this.cube.position.x = wasm.add(this.vx, this.cube.position.x);
   this.cube.position.y = wasm.add(this.vy, this.cube.position.y);
   this.alpha = wasm.subtract(this.alpha, 0.5);
   this.cube.rotation.x = wasm.add(this.cube.rotation.x, 0.1);
   this.cube.rotation.y = wasm.add(this.cube.rotation.y, 0.1);
   this.cube.material.opacity = wasm.multiply(this.alpha, 0.00392156863);
  }
}

  function updateAllParticles(pos = new THREE.Vector3(0,0,0)) {
      if (drawing & !guiData.drawSpheres) {
      let p = new Particle(pos);
      particles.push(p);
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      particles[i].update();

      if (particles[i].finished()) {
        // remove this particle
        scene.remove( particles[i] );
        console.log("removed??", particles.length, scene.children.length)
        particles.splice(i, 1);
      }
    }
  }

// Drawing constants.
var MINIMIM_POINT_DISTANCE = 0.001;
var MINIMUM_STROKE_POINTS = 2;
var MINIMUM_BRUSH_POINTS = 2;

var STROKE_DISTANCE = 0.1;
var STROKE_WIDTH_EASING = 0.05;
var STROKE_WIDTH_MINIMUM = 0.00125;
var STROKE_WIDTH_MAXIMUM = 0.1;
var STROKE_WIDTH_MODIFIER = 1.25;

var STROKE_POSITION_EASING = 0.5;
var STROKE_VELOCITY_EASING = 0.5;
var STROKE_ORTHOGONAL_EASING = 0.5;
var STROKE_NORMAL_EASING = 0.95;
var STROKE_NORMAL_QUAT_EASING = 0.5;

var MINIMIM_ERASE_ENERGY = 0.005;
var MINIMIM_ERASE_ENERGY_FRAMES = 15;

// Setup drawing variables.
var drawing = false;
var stroke = [];
var strokes = [];
var strokeIndex = 0;

var dots = [];

var brush;
var brushStroke = [];

var drawMaterial = new THREE.RawShaderMaterial({
  vertexShader: document.getElementById( 'vertexShader' ).textContent,
  fragmentShader: document.getElementById( 'fragmentShader' ).textContent,
  side: THREE.DoubleSide,
  transparent: true
});

/**
 * Use the `getARDisplay()` utility to leverage the WebVR API
 * to see if there are any AR-capable WebVR VRDisplays. Returns
 * a valid display if found. Otherwise, display the unsupported
 * browser message.
 */
THREE.ARUtils.getARDisplay().then(function (display) {
  if (display) {
    vrDisplay = display;
    init();
  } else {
    THREE.ARUtils.displayUnsupportedMessage();
  }
});

function init() {
  // Turn on the debugging panel
  //var arDebug = new THREE.ARDebug(vrDisplay);
  //document.body.appendChild(arDebug.getElement());

  // Setup the three.js rendering environment
  renderer = new THREE.WebGLRenderer({ alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.autoClear = false;
  canvas = renderer.domElement;
  document.body.appendChild(canvas);
  scene = new THREE.Scene();

  // Creating the ARView, which is the object that handles
  // the rendering of the camera stream behind the three.js
  // scene
  arView = new THREE.ARView(vrDisplay, renderer);

  // The ARPerspectiveCamera is very similar to THREE.PerspectiveCamera,
  // except when using an AR-capable browser, the camera uses
  // the projection matrix provided from the device, so that the
  // perspective camera's depth planes and field of view matches
  // the physical camera on the device.
  camera = new THREE.ARPerspectiveCamera(vrDisplay, 60, window.innerWidth / window.innerHeight, 0.01, 100);

  // VRControls is a utility from three.js that applies the device's
  // orientation/position to the perspective camera, keeping our
  // real world and virtual world in sync.
  vrControls = new THREE.VRControls(camera);

  // Bind our event handlers
  window.addEventListener('resize', onWindowResize, false);

  // Start drawing when the user touches the screen.
  renderer.domElement.addEventListener('touchstart', function(event) {
    drawing = true;
  });

  // Stop the current draw stroke when the user finishes the touch.
  renderer.domElement.addEventListener('touchend', function(event) {
    drawing = false;
    stroke.length = 0;
    strokeIndex += 1;
  });

  renderer.domElement.addEventListener('touchmove', function(event) {
    touchOffsetInfo = {
      x: event.changedTouches[0].pageX / document.body.clientWidth,
      // x: event.changedTouches[0].pageX / document.body.clientWidth - 0.5 * 0.1,
      y: event.changedTouches[0].pageY / document.body.clientHeight
      // x: event.changedTouches[0].pageX * 0.001,
      // y: event.changedTouches[0].pageY * 0.001 * -1
    }
    document.querySelector("#info").innerHTML = `${touchOffsetInfo.x} \n ${touchOffsetInfo.y}`
  });


  var light = new THREE.PointLight( 0xff0000, 1, 100 );
  light.position.set( 0, 0, 0 );
  scene.add( light );

  update();
}

// Get a point in front of the device to use as the drawing location.
// Pass in a THREE.Vector3 to be populated with data to avoid creating garbage.
// This strange function structure is a way of avoiding creating garbage while
// generating the rotated forward vector.
var getDrawPoint = (function() {
  // Setup a basic forward vector (scaled down so it's not so far away).
  var forward = new THREE.Vector3(0, 0, -1).multiplyScalar(STROKE_DISTANCE);

  // Create a scratch vector for generating the rotated forward vector.
  var rotatedForward = new THREE.Vector3();

  // New touch-offset vectors as well: (added by Andrés Cuervo)
  var translatedHorizontal = new THREE.Vector3();
  var translatedVertical = new THREE.Vector3();

  return function(out) {
    // Start with the camera position, which is equivalent to device pose.
    out.copy(camera.position);

    // Rotate the forward vector by the pose orientation.
    rotatedForward.copy(forward);
    rotatedForward.applyQuaternion(camera.quaternion);
    out.add(rotatedForward);

    var horizontal = new THREE.Vector3(1, 0, ).multiplyScalar(touchOffsetInfo.x);
    var verttical = new THREE.Vector3(0, 1, 0).multiplyScalar(touchOffsetInfo.y);
    translatedHorizontal.copy(horizontal);
    translatedHorizontal.applyQuaternion(camera.quaternion);
    // translatedVertical.copy(vertical);
    // translatedVertical.applyQuaternion(camera.quaternion);
    // out.add(translatedHorizontal);
    // out.add(translatedVertical);
  }
})();


// Basic physics parameters to help smooth out input data for nicer
// brsuh strokes
var strokeWidth = STROKE_WIDTH_MINIMUM;

var position = new THREE.Vector3();
var previousPosition = new THREE.Vector3();

var normalQuat = new THREE.Quaternion();
var previousNormalQuat = new THREE.Quaternion();

var normal = new THREE.Vector3(0, 0, 1);
var previousNormal = new THREE.Vector3(0, 0, 1);

var velocity = new THREE.Vector3();
var previousVelocity = new THREE.Vector3();

var acceleration = new THREE.Vector3();
// An array to keep track of the past accelerations
var accelerationArray = [];

/**
 * This function returns an object that represents a point in the stroke.
 * The position, normal, velocity and width values are used to help calculate
 * how the stroke will look. They are set by the physics values being
 * calculated every frame inside the updatePhysics function
 */
function getStroke()
{
  return {
    position: new THREE.Vector3(position.x, position.y, position.z),
    normal: new THREE.Vector3(normal.x, normal.y, normal.z),
    velocity: new THREE.Vector3(velocity.x, velocity.y, velocity.z),
    width: strokeWidth
  };
}

const threeObjBaseScale = 0.0025

function makeAdot(strokeInfo) {
  // var geometry = new THREE.BoxGeometry( 1,1,1 );
  // var geometry = new THREE.SphereGeometry( 5, 12, 12 );
  // var geometry = new THREE.RingGeometry( 1, 5, 32 );
  // var geometry = new THREE.CircleGeometry( 5, 32 );
  var geometry = new THREE.OctahedronGeometry(2, 1); // With the second param > 0 this is no longer an octahedrom but it looks so cool!!!
  // var geometry = new THREE.CylinderGeometry( 5, 5, 20, 32 );
  // var geometry = new THREE.ConeGeometry( 5, 20, 32 );
  // var material = new THREE.MeshBasicMaterial( {
  //   color: 0x2EAFAC,
  //   wireframe: guiData.isWireframe
  // });
  // var material = new THREE.MeshNormalMaterial({
  //   wireframe: guiData.isWireframe
  // });
  // var material = new THREE.MeshPhongMaterial({
  //   specular: 70,
  //   wireframe: guiData.isWireframe,
  // });
  var material = new THREE.MeshToonMaterial({
    wireframe: guiData.isWireframe,
  });
  // var material = new THREE.MeshDepthMaterial({
  //   wireframe: guiData.isWireframe
  // });

  // material.color.set(new THREE.Color(0x2EAFAC));
  // material.color.setHex( 0x2EAFAC );

  var threeObject = new THREE.Mesh( geometry, material );
  threeObject.position.set(
    strokeInfo.position.x, // + touchOffsetInfo.x,
    strokeInfo.position.y,// + touchOffsetInfo.y,
    strokeInfo.position.z);
  // threeObject.rotation.set(90, 0, 45);
  const stroke = getStroke();

  let velocityMult = 1;
  if (guiData.applyVelocityMult) {
    velocityMult = stroke.velocity.manhattanLength() * 100;
  }
  // const velocityMult = 0.2;
  // document.querySelector('#info').innerHTML = velocityMult;
  threeObject.scale.set(threeObjBaseScale * velocityMult,
                        threeObjBaseScale * velocityMult,
                        threeObjBaseScale * velocityMult);
  return threeObject;
}

function processAllDots() {
  for (let i = 0; i < dots.length; ++i) {
    const currentDot = dots[i]
    // currentDot.position.y += Math.cos(performance.now() * 0.001 * i) * 0.005
    // currentDot.rotation.y += 0.1
  }
}

/**
 * This function is called when the user touches down and starts to draw
 * a stroke
 */
function processDraw() {
  // Instead of brush, keep a list of dot positions & render those???
  if (guiData.drawSpheres) {
    let dot =  makeAdot(getStroke());
    dots.push(dot);
    scene.add(dot);
  }

  // document.querySelector('#info').innerHTML = dots.length;

  // NOTE: Commented this out to stop the original brush stroke drawing
  // TODO: turn this into a template, comment it out, and then delete from here!
  // Add the draw point to the current stroke.
  // stroke.push(getStroke());

  // Check to see if you have enough points (2) to start drawing a stroke
  if(stroke.length < MINIMUM_STROKE_POINTS) {
    return;
  }

  // Get the last two points in the stroke
  var s0 = stroke[stroke.length - 2];
  var s1 = stroke[stroke.length - 1];

  // Check if the distance between the last two points is bigger
  // than a set amount, this avoids tiny strips in the brush stroke
  if(s0.position.distanceTo(s1.position) < MINIMIM_POINT_DISTANCE) {
    stroke.pop();
    return;
  }

  // Remove the old stroke from the scene so we can regenerate the stroke.
  if (strokes[strokeIndex]) {
    scene.remove(strokes[strokeIndex]);
  }

  // Generate a new stroke and cache it in our array of strokes
  strokes[strokeIndex] = generateStroke(stroke);

  // Add the stroke to the threejs scene for rendering
  scene.add(strokes[strokeIndex]);
}

/**
 * This function is responsible for constantly rendering a brush reticle
 * when the user is not touching down on the screen. This helps to pre-
 * visualize the dynamics of the brush (color, stroke width, etc)
 */

function processDrawBrush() {
  // Add the draw point to the current stroke.
  brushStroke.push(getStroke());


  // Don't use positions if they aren't far enough away from the previous point.
  if(brushStroke.length < MINIMUM_BRUSH_POINTS) {
    return;
  }

  // Remove the old brush reticle from the scene so we can regenerate it
  if (brush) {
    brushStroke.shift();
    scene.remove(brush);
  }

  // Get the last two points in the stroke
  var b0 = brushStroke[brushStroke.length - 2];
  var b1 = brushStroke[brushStroke.length - 1];

  // Check if the distance between the last two points is bigger
  // than a set amount, this avoids tiny strips in the brush stroke
  if(b0.position.distanceTo(b1.position) < MINIMIM_POINT_DISTANCE) {
    return;
  }

  // Generate a new stroke and sets it to brush reticle
  brush = generateStroke(brushStroke);

  // Add the brush reticle to the threejs scene for rendering
  scene.add(brush);
}

/**
 * This function calculates the positions, normals, uvs and velocities
 * float32Arrays needed to create a buffer geometry so we can render our brush
 * strokes using threejs (WebGL)
 */
function generateStroke(strokeData) {
  // Create Float32Arrays of the proper size to hold vertex information
  // Each stroke is rendered by a triangle strip, thus each stroke point yields
  // two verticies, and each vertex contains three (x, y, z) or two
  // floats (u, v) depending on property.
  var positions = new Float32Array(strokeData.length * 2 * 3);
  var normals = new Float32Array(strokeData.length * 2 * 3);
  var uvs = new Float32Array(strokeData.length * 2 * 2);
  var velocities = new Float32Array(strokeData.length * 2 * 3);

  // Create a Vector3 to cache the vertex offset vector
  var v = new THREE.Vector3();
  // Create a reference to the last stroke point's velocity
  var lastVelocity;
  // Create two Vector3s to cache the positions of the two vertex positions
  // calculated from the origin stroke position and its physics properties
  var p1 = new THREE.Vector3();
  var p2 = new THREE.Vector3();
  // Create a variable to keep track of whether the current stroke point's
  // velocity is in the opposite direction of the last point's velocity
  var flip = false;

  // loop through the stroke points and calculate its two emiited vertex
  // offset positions and set their other properties in the Float32Arrays
  // created above
  for (var i = 0; i < strokeData.length; i++) {
    // Get the current stroke point
    var entry = strokeData[i];

    // Calculate the stroke point's offset by using the cross product of the
    // stroke point's normal and its velocity
    v.crossVectors(entry.normal, entry.velocity);
    // Normalize the vector and scale it by the precalculated stroke width
    v.normalize();
    // This width is based on how fast the user was moving the device when the
    // stroke was drawn
    v.multiplyScalar(entry.width);

    // If this isn't the first point check for a velocity flip, otherwise create
    // a new Vector3
    if( lastVelocity ) {
      // Use the dot product to check whether the current velocity is in the
      // direction as the previous stroke's velocity
      var directionChange = lastVelocity.dot( entry.velocity );
      if( directionChange < 0 ) {
        flip = !flip;
      }
    }
    else {
      lastVelocity = new THREE.Vector3();
    }
    lastVelocity.copy( entry.velocity );

    // this is used to avoid improper drawing of triangles when the user
    // changes direction of a stroke
    if( flip ) {
      p1.addVectors(entry.position, v);
      p2.subVectors(entry.position, v);
    }
    else {
      p1.subVectors(entry.position, v);
      p2.addVectors(entry.position, v);
    }

    // Calculate the offset for the current vertex (i * 2 * 3)
    // Set the positions for the ith and ith + 1 verticies
    var index = i * 2 * 3;
    positions[index] = p1.x;
    positions[index + 1] = p1.y;
    positions[index + 2] = p1.z;
    positions[index + 3] = p2.x;
    positions[index + 4] = p2.y;
    positions[index + 5] = p2.z;

    // Calculate the offset for the current vertex (i * 2 * 3)
    index = i * 2 * 3;
    // Set the normals for the ith and ith + 1 verticies
    normals[index] = entry.normal.x;
    normals[index + 1] = entry.normal.y;
    normals[index + 2] = entry.normal.z;
    normals[index + 3] = entry.normal.x;
    normals[index + 4] = entry.normal.y;
    normals[index + 5] = entry.normal.z;

    // Calculate the offset for the current vertex (i * 2 * 3)
    index = i * 2 * 3;
    // Set the velocities for the ith and ith + 1 verticies
    velocities[index] = entry.velocity.x;
    velocities[index + 1] = entry.velocity.y;
    velocities[index + 2] = entry.velocity.z;
    velocities[index + 3] = entry.velocity.x;
    velocities[index + 4] = entry.velocity.y;
    velocities[index + 5] = entry.velocity.z;


    // Calculate the offset for the current vertex (i * 2 * 3)
    index = i * 2 * 2;
    // Set the uvs for the ith and ith + 1 verticies
    // Each complete stroke has vertex coordinates from (0,0) to (1,1)
    uvs[index] = i / (strokeData.length - 1);
    uvs[index + 1] = 0;
    uvs[index + 2] = i / (strokeData.length - 1);
    uvs[index + 3] = 1;
  }

  // Create a Threejs BufferGeometry
  var geometry = new THREE.BufferGeometry();
  function disposeArray() { this.array = null; }
  // Add attributes to the buffer geometry using the Float32Arrays created
  // above. This will tell our shader pipeline information about each vertex
  // so we can create all types of dynamic strokes & paints
  geometry.addAttribute('position', new THREE.BufferAttribute(positions, 3).onUpload(disposeArray));
  geometry.addAttribute('normal', new THREE.BufferAttribute(normals, 3).onUpload(disposeArray));
  geometry.addAttribute('uv', new THREE.BufferAttribute(uvs, 2).onUpload(disposeArray));
  geometry.addAttribute('velocity', new THREE.BufferAttribute(velocities, 3).onUpload(disposeArray));
  geometry.computeBoundingSphere();

  // Create a Threejs mesh and set its draw mode to triangle strips
  mesh = new THREE.Mesh(geometry, drawMaterial);
  // mesh.drawMode = THREE.TriangleStripDrawMode;
  mesh.drawMode = THREE[drawMode];
  return mesh;
}

/**
 * Small utility function to sum the last n frames of acceleration to see if
 * the device was shaken. If the device was shaken, then the last stroke is
 * erased.
 */
function checkForShake()
{
  //Calculate the current acceleration's magnitude and add it to the
  // acceleration array
  accelerationArray.push(acceleration.length());
  var len = accelerationArray.length;
  // if the accelerationArray has enough frames to calculate whether the user
  // has shaken the device, then check for a shake
  if(len > MINIMIM_ERASE_ENERGY_FRAMES) {
    // Sum the "energy" total by looping through the accelerationArray values
    var energy = 0;
    for(var i = 0; i < len; i++) {
      energy += accelerationArray[i];
    }
    // Check to see if the total energy is greate than a preset amount
    // this amount was calculated via user testing different shake thresholds
    if(energy > MINIMIM_ERASE_ENERGY * MINIMIM_ERASE_ENERGY_FRAMES) {
      // If a shake was detected, clear the accelerationArray so we don't get
      // multiple shakes in a small time frame
      accelerationArray.length = 0;
      // This is the action that happens when the user shakes the device, the
      // app clears or removes the last stroke
      clearLastStroke();
    }
    else {
      // If the energy wasn't high enough pop off the oldest acceleration value
      accelerationArray.shift();
    }
  }
}


/**
 * Clears all the strokes and essentially lets the user start over
 */
function clearStrokes()
{
  // If the user if currently drawing, stop
  drawing = false;
  // Clear the current stroke array
  stroke.length = 0;
  // Reset the current stroke index
  strokeIndex = 0;

  // Remove all the threejs mesh strokes from the scene
  var len = strokes.length;
  for( var i = 0; i < len; i++ ) {
    scene.remove(strokes[i]);
  }
}

/**
 * Clears the last stroke, acts essentially as an UNDO
 */
function clearLastStroke()
{
  // If the user if currently drawing, stop, and remove the stroke
  if( drawing ) {
    drawing = false;
    scene.remove(strokes[strokeIndex]);
    stroke.length = 0;
  }
  // Also remove the last drawn stroke
  strokeIndex -= 1;
  scene.remove(strokes[strokeIndex]);
}

/**
 * update physics function, called once per frame. Handles updating and
 * smoothing out rough input data from AR Session
 */
function updatePhysics()
{
  // Cache previous positions & normals
  previousPosition.copy(position);
  previousNormal.copy(normal);
  previousNormalQuat.copy(normalQuat);
  previousVelocity.copy(velocity);

  // Update Drawing Stroke Position
  getDrawPoint(position);
  position.lerpVectors(previousPosition, position, STROKE_POSITION_EASING);

  normalQuat.slerp(camera.quaternion, STROKE_NORMAL_QUAT_EASING);

  // Update Drawing Stroke Normal
  normal.set(0, 0, 1);
  normal.applyQuaternion(normalQuat);
  normal.normalize();
  normal.lerpVectors(previousNormal, normal, STROKE_NORMAL_EASING);

  // Update velocity
  velocity.subVectors(position, previousPosition);
  velocity.lerpVectors(previousVelocity, velocity, STROKE_VELOCITY_EASING);

  // Update acceleration
  acceleration.subVectors(velocity, previousVelocity);

  // Update Drawing Stroke Width
  strokeWidth = THREE.Math.lerp(strokeWidth, velocity.length() * STROKE_WIDTH_MODIFIER, STROKE_WIDTH_EASING);
  strokeWidth = Math.min( Math.max( strokeWidth, STROKE_WIDTH_MINIMUM ), STROKE_WIDTH_MAXIMUM );
}

/**
 * The render loop, called once per frame. Handles updating
 * our scene and rendering.
 */
function update() {
  // Clears color from the frame before rendering the camera (arView) or scene.
  renderer.clearColor();

  // Render the device's camera stream on screen first of all.
  // It allows to get the right pose synchronized with the right frame.
  arView.render();

  // Update our camera projection matrix in the event that
  // the near or far planes have updated
  camera.updateProjectionMatrix();

  // Update our perspective camera's positioning
  vrControls.update();

  // Update Brush Physics
  updatePhysics();

  updateAllParticles(getStroke().position);

  // Check for shake to undo functionality
  checkForShake();

  // Update the current graffiti stroke.
  if (drawing) {
    processDraw();
  }
  // Uncomment to draw brush reticle
  // processDrawBrush();

  // Process all the dots in the scene
  processAllDots();

  // Render our three.js virtual scene
  renderer.clearDepth();
  renderer.render(scene, camera);

  // Kick off the requestAnimationFrame to call this function
  // when a new VRDisplay frame is rendered
  vrDisplay.requestAnimationFrame(update);
}

/**
 * On window resize, update the perspective camera's aspect ratio,
 * and call `updateProjectionMatrix` so that we can get the latest
 * projection matrix provided from the device
 */
function onWindowResize () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}



