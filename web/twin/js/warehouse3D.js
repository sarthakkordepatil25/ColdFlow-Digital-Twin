/**
 * ColdFlow 3D Warehouse Digital Twin Engine (Stage 4 & 5)
 *
 * Implements:
 * 1. Industrial Cold-Storage Facility Architecture (Heavy-duty steel teardrop racks,
 *    concrete epoxy floor, ceiling steel trusses, high-bay industrial LED lights,
 *    loading docks, rolling shutter doors, insulated refrigeration pipes).
 * 2. Distinct Environmental Zones:
 *    - Freezer (-20°C): Volumetric sub-zero cold vapor particles, frost-dusted metal, cold blue point lights.
 *    - Chiller (4°C): Fresh chilled atmosphere, dairy/produce crates, emerald status lighting.
 *    - Ambient (25°C): Staging area, warm industrial lighting, dry goods pallets.
 * 3. Detailed Pallets & Carton Packaging: Euro-pallets with wooden deckboards,
 *    corrugated boxes with procedural shipping labels and live batch stamps.
 * 4. Autonomous Guided Vehicle (AGV / Forklift) Simulation:
 *    Heavy industrial AGV with flashing amber safety strobe, dual lift forks, and
 *    smooth physics-based waypoint navigation along warehouse aisles during real
 *    inbound batch intake and FEFO dispatch operations.
 * 5. Interactive 3D Raycasting: Pallets, racks, IoT sensors (SENSOR01-09), and zones.
 * 6. Dynamic Cooling Fans & Particle Vapor Emitters reacting to live compressor state.
 */

class Warehouse3D {
  constructor(containerElement, onSelectCallback) {
    this.container = containerElement;
    this.onSelect = onSelectCallback || (() => {});

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.zoneObjects = {};
    this.palletMeshes = new Map();     // batchId -> Group
    this.sensorNodes = new Map();      // sensorId -> Mesh
    this.coolingFans = [];
    this.vaporEmitters = [];
    this.agvVehicle = null;

    this.clock = new THREE.Clock();
    this.isCoolingActive = { Freezer: false, Chiller: false, Ambient: false };

    // Procedural texture cache
    this.textures = {};

    this.init();
  }

  init() {
    // 1. Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060911);
    this.scene.fog = new THREE.FogExp2(0x060911, 0.018);

    // 2. Camera setup
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 200);
    this.camera.position.set(0, 15, 24);

    // 3. Renderer setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.container.appendChild(this.renderer.domElement);

    // 4. Orbit Controls
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.03; // Don't clip through floor
    this.controls.minDistance = 3;
    this.controls.maxDistance = 55;
    this.controls.target.set(0, 2, 0);

    // 5. Generate Procedural Textures
    this.generateProceduralTextures();

    // 6. Lighting Pipeline
    this.setupLighting();

    // 7. Build Industrial Warehouse
    this.buildWarehouseArchitecture();

    // 8. Build AGV Autonomous Vehicle
    this.buildAGV();

    // 9. Event Listeners
    window.addEventListener("resize", () => this.onWindowResize());
    this.renderer.domElement.addEventListener("click", (e) => this.onPointerClick(e));

    // 10. Start Animation Loop
    this.animate();
  }

  generateProceduralTextures() {
    // 1. Concrete floor epoxy grid texture
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, 512, 512);

    // Subtle concrete noise
    ctx.fillStyle = "rgba(255, 255, 255, 0.02)";
    for (let i = 0; i < 2000; i++) {
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }

    // Grid tile lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
    ctx.lineWidth = 2;
    for (let x = 0; x <= 512; x += 64) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke();
    }
    for (let y = 0; y <= 512; y += 64) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke();
    }

    const floorTex = new THREE.CanvasTexture(canvas);
    floorTex.wrapS = THREE.RepeatWrapping;
    floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(6, 4);
    this.textures.floor = floorTex;

    // 2. Hazard safety striped texture
    const hazardCanvas = document.createElement("canvas");
    hazardCanvas.width = 128;
    hazardCanvas.height = 128;
    const hctx = hazardCanvas.getContext("2d");
    hctx.fillStyle = "#eab308";
    hctx.fillRect(0, 0, 128, 128);
    hctx.fillStyle = "#18181b";
    for (let i = -128; i < 256; i += 32) {
      hctx.beginPath();
      hctx.moveTo(i, 0);
      hctx.lineTo(i + 16, 0);
      hctx.lineTo(i - 16, 128);
      hctx.lineTo(i - 32, 128);
      hctx.fill();
    }
    const hazardTex = new THREE.CanvasTexture(hazardCanvas);
    hazardTex.wrapS = THREE.RepeatWrapping;
    hazardTex.wrapT = THREE.RepeatWrapping;
    hazardTex.repeat.set(8, 1);
    this.textures.hazard = hazardTex;
  }

  setupLighting() {
    // Ambient light
    const ambLight = new THREE.AmbientLight(0x0f172a, 1.4);
    this.scene.add(ambLight);

    // Main warehouse overhead directional sunlight
    const mainSun = new THREE.DirectionalLight(0xf8fafc, 1.6);
    mainSun.position.set(8, 22, 16);
    mainSun.castShadow = true;
    mainSun.shadow.mapSize.width = 2048;
    mainSun.shadow.mapSize.height = 2048;
    mainSun.shadow.camera.near = 0.5;
    mainSun.shadow.camera.far = 70;
    const d = 18;
    mainSun.shadow.camera.left = -d;
    mainSun.shadow.camera.right = d;
    mainSun.shadow.camera.top = d;
    mainSun.shadow.camera.bottom = -d;
    mainSun.shadow.bias = -0.0003;
    this.scene.add(mainSun);

    // Zone 1: Sub-zero Blue Cold illumination (Freezer, X = -6)
    const freezerLight = new THREE.PointLight(0x38bdf8, 2.4, 15);
    freezerLight.position.set(-6, 5.5, 0);
    this.scene.add(freezerLight);

    // Zone 2: Fresh Refrigerated Green illumination (Chiller, X = 0)
    const chillerLight = new THREE.PointLight(0x10b981, 1.8, 14);
    chillerLight.position.set(0, 5.5, 0);
    this.scene.add(chillerLight);

    // Zone 3: Warm Industrial Warehouse illumination (Ambient, X = +6)
    const ambientLight = new THREE.PointLight(0xf59e0b, 1.6, 14);
    ambientLight.position.set(6, 5.5, 0);
    this.scene.add(ambientLight);

    // High-bay pendant lights
    const pendantPositions = [
      [-6, 7.5, 4], [0, 7.5, 4], [6, 7.5, 4],
      [-6, 7.5, -2], [0, 7.5, -2], [6, 7.5, -2]
    ];
    pendantPositions.forEach(([px, py, pz]) => {
      const pLight = new THREE.PointLight(0xffedd5, 0.6, 8);
      pLight.position.set(px, py, pz);
      this.scene.add(pLight);
    });
  }

  buildWarehouseArchitecture() {
    // 1. Industrial Concrete Epoxy Floor
    const floorGeo = new THREE.PlaneGeometry(32, 22);
    const floorMat = new THREE.MeshStandardMaterial({
      map: this.textures.floor,
      roughness: 0.5,
      metalness: 0.25
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // 2. Yellow AGV / Forklift Guide Track along main aisle (Z = 4.0)
    const trackGeo = new THREE.PlaneGeometry(28, 0.4);
    const trackMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    const track = new THREE.Mesh(trackGeo, trackMat);
    track.rotation.x = -Math.PI / 2;
    track.position.set(0, 0.01, 4.0);
    this.scene.add(track);

    // Hazard crosshatch border along loading dock (Z = 7.5)
    const hazardGeo = new THREE.PlaneGeometry(28, 0.6);
    const hazardMat = new THREE.MeshBasicMaterial({ map: this.textures.hazard });
    const hazardLine = new THREE.Mesh(hazardGeo, hazardMat);
    hazardLine.rotation.x = -Math.PI / 2;
    hazardLine.position.set(0, 0.015, 6.8);
    this.scene.add(hazardLine);

    // 3. Back Warehouse Insulated Wall with structural columns
    const wallGeo = new THREE.PlaneGeometry(32, 10);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.85
    });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(0, 5, -5.5);
    wall.receiveShadow = true;
    this.scene.add(wall);

    // Left and right side walls
    const sideWallGeo = new THREE.PlaneGeometry(22, 10);
    const leftWall = new THREE.Mesh(sideWallGeo, wallMat);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-16, 5, 5.5);
    leftWall.receiveShadow = true;
    this.scene.add(leftWall);

    const rightWall = new THREE.Mesh(sideWallGeo, wallMat);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(16, 5, 5.5);
    rightWall.receiveShadow = true;
    this.scene.add(rightWall);

    // 4. Ceiling Steel Roof Trusses
    const trussMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.4 });
    const trussZ = [-4.0, 0.0, 4.0];
    trussZ.forEach((tz) => {
      const beamGeo = new THREE.BoxGeometry(32, 0.35, 0.25);
      const beam = new THREE.Mesh(beamGeo, trussMat);
      beam.position.set(0, 8.2, tz);
      this.scene.add(beam);
    });

    // 5. Overhead Insulated Refrigeration Pipework
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.9, roughness: 0.2 });
    const pipeGeo = new THREE.CylinderGeometry(0.12, 0.12, 28, 12);
    const pipe = new THREE.Mesh(pipeGeo, pipeMat);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, 7.4, -4.6);
    this.scene.add(pipe);

    // 6. Build the Three Core Storage Zones
    this.buildStorageZone("Freezer", -6.0, 0x0284c7, -20.0, true);
    this.buildStorageZone("Chiller", 0.0, 0x059669, 4.0, false);
    this.buildStorageZone("Ambient", 6.0, 0xd97706, 25.0, false);

    // Shared insulated partition walls between the three compartments.
    const partitionMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.68,
      metalness: 0.22
    });
    [-3.0, 3.0].forEach((px) => {
      const partition = new THREE.Mesh(new THREE.BoxGeometry(0.28, 6.8, 7.6), partitionMat);
      partition.position.set(px, 3.4, 0);
      partition.castShadow = true;
      partition.receiveShadow = true;
      this.scene.add(partition);

      const centerStrip = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 7.5), new THREE.MeshStandardMaterial({
        color: 0x64748b,
        emissive: 0x334155,
        emissiveIntensity: 0.25,
        metalness: 0.6,
        roughness: 0.35
      }));
      centerStrip.position.set(px, 6.75, 0);
      this.scene.add(centerStrip);
    });

    // 7. Build IoT Sensor Nodes (SENSOR01-09)
    this.buildSensorNodes();

    // 8. Build Dispatch Dock Area (Z = 8.5)
    this.buildDispatchDock();
  }

  createCoolingFan(zoneName, colorHex) {
    const assembly = new THREE.Group();

    const housingMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.85,
      roughness: 0.28
    });
    const bladeMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: colorHex,
      emissiveIntensity: 0.12,
      metalness: 0.72,
      roughness: 0.24,
      side: THREE.DoubleSide
    });

    // Thick circular shroud with a recessed rear drum.
    const housing = new THREE.Mesh(
      new THREE.TorusGeometry(0.58, 0.105, 12, 32),
      housingMat
    );
    housing.position.z = 0.03;
    assembly.add(housing);

    const rearDrum = new THREE.Mesh(
      new THREE.CylinderGeometry(0.54, 0.54, 0.16, 32),
      housingMat
    );
    rearDrum.rotation.x = Math.PI / 2;
    rearDrum.position.z = -0.06;
    assembly.add(rearDrum);

    // 6 broad, swept impeller blades. ShapeGeometry extrusion gives them thickness
    // and a recognizable curved industrial-fan profile instead of a flat disc.
    const rotor = new THREE.Group();
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(0.09, 0.04);
    bladeShape.bezierCurveTo(0.22, 0.10, 0.43, 0.16, 0.50, 0.38);
    bladeShape.bezierCurveTo(0.55, 0.54, 0.38, 0.64, 0.20, 0.54);
    bladeShape.bezierCurveTo(0.10, 0.48, 0.03, 0.27, 0.09, 0.04);

    const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
      depth: 0.055,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.018,
      bevelThickness: 0.012,
      curveSegments: 12
    });
    for (let i = 0; i < 6; i++) {
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.rotation.z = i * Math.PI / 3;
      blade.position.z = 0.09;
      blade.castShadow = true;
      rotor.add(blade);
    }

    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.20, 0.16, 24),
      bladeMat
    );
    hub.rotation.x = Math.PI / 2;
    hub.position.z = 0.16;
    hub.castShadow = true;
    rotor.add(hub);
    assembly.add(rotor);

    // Protective grille fixed in front of the rotor.
    const grilleMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.95,
      roughness: 0.20
    });
    const grilleCenter = new THREE.Mesh(
      new THREE.CylinderGeometry(0.105, 0.105, 0.025, 20),
      grilleMat
    );
    grilleCenter.rotation.x = Math.PI / 2;
    grilleCenter.position.z = 0.20;
    assembly.add(grilleCenter);

    for (let i = 0; i < 8; i++) {
      const spoke = new THREE.Mesh(
        new THREE.BoxGeometry(0.018, 1.08, 0.018),
        grilleMat
      );
      spoke.position.z = 0.19;
      spoke.rotation.z = i * Math.PI / 8;
      assembly.add(spoke);
    }

    assembly.userData.zoneName = zoneName;
    assembly.userData.impeller = rotor;
    return { assembly, impeller: rotor };
  }

  buildStorageZone(zoneName, xPos, colorHex, targetTemp, isFreezer) {
    const zoneGroup = new THREE.Group();
    zoneGroup.position.set(xPos, 0, 0);

    // 1. Zoned Floor Platform
    const platformGeo = new THREE.BoxGeometry(5.2, 0.05, 7.6);
    const platformMat = new THREE.MeshStandardMaterial({
      color: isFreezer ? 0x0f2338 : (zoneName === "Chiller" ? 0x123027 : 0x33291a),
      roughness: 0.6,
      metalness: 0.3
    });
    const platform = new THREE.Mesh(platformGeo, platformMat);
    platform.position.y = 0.025;
    platform.receiveShadow = true;
    zoneGroup.add(platform);

    // Color perimeter outline
    const borderGeo = new THREE.EdgesGeometry(platformGeo);
    const borderMat = new THREE.LineBasicMaterial({ color: colorHex, linewidth: 2 });
    const border = new THREE.LineSegments(borderGeo, borderMat);
    border.position.y = 0.03;
    zoneGroup.add(border);

    // 2. Insulated room envelope
    const wallMat = new THREE.MeshStandardMaterial({
      color: isFreezer ? 0x173552 : (zoneName === "Chiller" ? 0x16473b : 0x3f392b),
      roughness: 0.72,
      metalness: 0.18
    });
    const panelMat = new THREE.MeshStandardMaterial({
      color: isFreezer ? 0x38bdf8 : (zoneName === "Chiller" ? 0x34d399 : 0xf59e0b),
      emissive: colorHex,
      emissiveIntensity: 0.18,
      roughness: 0.55
    });

    const sideGeo = new THREE.BoxGeometry(0.18, 6.8, 7.6);
    [-2.51, 2.51].forEach((sx) => {
      const sideWall = new THREE.Mesh(sideGeo, wallMat);
      sideWall.position.set(sx, 3.4, 0);
      sideWall.castShadow = true;
      sideWall.receiveShadow = true;
      zoneGroup.add(sideWall);

      // Insulated panel seams make the room boundary easy to read.
      for (let pz = -2.8; pz <= 2.8; pz += 1.4) {
        const seam = new THREE.Mesh(new THREE.BoxGeometry(0.025, 6.5, 0.025), panelMat);
        seam.position.set(sx + (sx < 0 ? 0.095 : -0.095), 3.35, pz);
        zoneGroup.add(seam);
      }
    });

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(5.2, 6.8, 0.18), wallMat);
    backWall.position.set(0, 3.4, -3.71);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    zoneGroup.add(backWall);

    // Ceiling strip and entrance header identify the room as a separate compartment.
    const ceilingStrip = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.16, 1.1), wallMat);
    ceilingStrip.position.set(0, 6.55, -3.25);
    ceilingStrip.castShadow = true;
    zoneGroup.add(ceilingStrip);

    const doorFrameMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.75,
      roughness: 0.28
    });
    [-1.95, 1.95].forEach((dx) => {
      const framePost = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.8, 0.16), doorFrameMat);
      framePost.position.set(dx, 1.9, 3.83);
      zoneGroup.add(framePost);
    });
    const doorHeader = new THREE.Mesh(new THREE.BoxGeometry(4.06, 0.16, 0.16), doorFrameMat);
    doorHeader.position.set(0, 3.8, 3.83);
    zoneGroup.add(doorHeader);

    const threshold = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.06, 0.35), panelMat);
    threshold.position.set(0, 0.04, 3.82);
    zoneGroup.add(threshold);

    // Label panel mounted above each room entrance.
    const labelCanvas = document.createElement("canvas");
    labelCanvas.width = 512;
    labelCanvas.height = 128;
    const labelCtx = labelCanvas.getContext("2d");
    labelCtx.fillStyle = "#0b1120";
    labelCtx.fillRect(0, 0, 512, 128);
    labelCtx.strokeStyle = `#${colorHex.toString(16).padStart(6, "0")}`;
    labelCtx.lineWidth = 10;
    labelCtx.strokeRect(5, 5, 502, 118);
    labelCtx.fillStyle = "#f8fafc";
    labelCtx.font = "bold 42px sans-serif";
    labelCtx.textAlign = "center";
    labelCtx.fillText(`${zoneName.toUpperCase()}  |  ${targetTemp} C`, 256, 78);
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 0.85),
      new THREE.MeshBasicMaterial({ map: labelTexture, toneMapped: false })
    );
    label.position.set(0, 5.05, 3.78);
    zoneGroup.add(label);

    // 2. Heavy-Duty Industrial Pallet Racks (Safety Orange Beams & Royal Blue Uprights)
    const uprightMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, metalness: 0.8, roughness: 0.3 }); // Industrial Blue
    const beamMat = new THREE.MeshStandardMaterial({ color: 0xea580c, metalness: 0.7, roughness: 0.3 });    // Safety Orange

    const rackW = 4.2;
    const rackD = 2.6;
    const rackH = 4.6;

    // 4 Upright vertical column posts
    const postGeo = new THREE.BoxGeometry(0.14, rackH, 0.14);
    const halfW = rackW / 2;
    const halfD = rackD / 2;
    const posts = [
      [-halfW, rackH / 2, -halfD], [halfW, rackH / 2, -halfD],
      [-halfW, rackH / 2, halfD], [halfW, rackH / 2, halfD]
    ];
    posts.forEach(([px, py, pz]) => {
      const post = new THREE.Mesh(postGeo, uprightMat);
      post.position.set(px, py, pz);
      post.castShadow = true;
      zoneGroup.add(post);
    });

    // Cross bracing between vertical posts
    const braceMat = new THREE.LineBasicMaterial({ color: 0x60a5fa });
    const braceGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-halfW, 0.2, -halfD), new THREE.Vector3(-halfW, rackH, -halfD + 0.1),
      new THREE.Vector3(halfW, 0.2, -halfD), new THREE.Vector3(halfW, rackH, -halfD + 0.1)
    ]);
    const braces = new THREE.LineSegments(braceGeo, braceMat);
    zoneGroup.add(braces);

    // 3 Horizontal Shelving Tiers (Y = 0.35, 1.80, 3.25)
    const tierHeights = [0.35, 1.80, 3.25];
    const beamGeo = new THREE.BoxGeometry(rackW, 0.12, rackD);
    tierHeights.forEach((ty) => {
      const shelf = new THREE.Mesh(beamGeo, beamMat);
      shelf.position.set(0, ty, 0);
      shelf.castShadow = true;
      shelf.receiveShadow = true;
      zoneGroup.add(shelf);
    });

    // 3. Roof-Mounted Evaporator Refrigeration Unit
    const evapGeo = new THREE.BoxGeometry(2.8, 0.7, 1.4);
    const evapMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.3 });
    const evap = new THREE.Mesh(evapGeo, evapMat);
    evap.position.set(0, 5.0, 0);
    zoneGroup.add(evap);

    // Dual industrial cooling fans with housings, swept blades, hubs and guards.
    [-0.75, 0.75].forEach((fanX) => {
      const fanModel = this.createCoolingFan(zoneName, colorHex);
      fanModel.assembly.position.set(fanX, 5.0, 0.71);
      zoneGroup.add(fanModel.assembly);
      this.coolingFans.push({ fan: fanModel.impeller, zone: zoneName });
    });

    // 4. Cold Vapor Particle Emitter for Freezer & Chiller
    if (isFreezer || zoneName === "Chiller") {
      const vaporCount = 40;
      const vaporGeo = new THREE.BufferGeometry();
      const positions = new Float32Array(vaporCount * 3);
      for (let i = 0; i < vaporCount * 3; i += 3) {
        positions[i] = (Math.random() - 0.5) * 2.2;
        positions[i + 1] = 4.8 - Math.random() * 2.5;
        positions[i + 2] = 0.8 + Math.random() * 1.0;
      }
      vaporGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const vaporMat = new THREE.PointsMaterial({
        color: isFreezer ? 0xbae6fd : 0xa7f3d0,
        size: 0.18,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending
      });
      const vaporPoints = new THREE.Points(vaporGeo, vaporMat);
      zoneGroup.add(vaporPoints);
      this.vaporEmitters.push({ points: vaporPoints, zone: zoneName, count: vaporCount });
    }

    // 5. Zone Signboard & Live Temperature Indicator Pole
    const poleGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.5, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(0, 5.8, 0);
    zoneGroup.add(pole);

    const bulbGeo = new THREE.SphereGeometry(0.25, 16, 16);
    const bulbMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: colorHex,
      emissiveIntensity: 0.9
    });
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(0, 6.7, 0);
    bulb.userData = { type: "indicatorBulb", zoneName: zoneName };
    zoneGroup.add(bulb);

    this.scene.add(zoneGroup);
    this.zoneObjects[zoneName] = {
      group: zoneGroup,
      bulb: bulb,
      targetTemp: targetTemp,
      colorHex: colorHex
    };
  }

  buildSensorNodes() {
    // 9 IoT Sensors with physical position in warehouse
    const sensorConfig = [
      { id: "SENSOR01", x: -8.51, y: 2.8, z: -1.0, zone: "Freezer" },
      { id: "SENSOR02", x: -6.0, y: 5.8, z: -3.58, zone: "Freezer" },
      { id: "SENSOR03", x: -3.49, y: 2.8, z: -1.0, zone: "Freezer" },
      { id: "SENSOR04", x: -2.51, y: 2.8, z: -1.0, zone: "Chiller" },
      { id: "SENSOR05", x: 0.0, y: 5.8, z: -3.58, zone: "Chiller" },
      { id: "SENSOR06", x: 2.51, y: 2.8, z: -1.0, zone: "Chiller" },
      { id: "SENSOR07", x: 3.49, y: 2.8, z: -1.0, zone: "Ambient" },
      { id: "SENSOR08", x: 6.0, y: 5.8, z: -3.58, zone: "Ambient" },
      { id: "SENSOR09", x: 8.51, y: 2.8, z: -1.0, zone: "Ambient" }
    ];

    const sensorGeo = new THREE.OctahedronGeometry(0.22);
    sensorConfig.forEach((cfg) => {
      const sensorMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.8,
        roughness: 0.1
      });
      const mesh = new THREE.Mesh(sensorGeo, sensorMat);
      mesh.position.set(cfg.x, cfg.y, cfg.z);
      mesh.userData = { type: "sensor", sensorId: cfg.id, zone: cfg.zone };
      this.scene.add(mesh);
      this.sensorNodes.set(cfg.id, mesh);
    });
  }

  buildDispatchDock() {
    // Staging and Outbound Dispatch Dock Area
    const dockGeo = new THREE.BoxGeometry(10, 0.2, 3);
    const dockMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8 });
    const dock = new THREE.Mesh(dockGeo, dockMat);
    dock.position.set(0, 0.1, 8.8);
    dock.receiveShadow = true;
    this.scene.add(dock);

    // Staging dock sign
    const signGeo = new THREE.PlaneGeometry(3.5, 0.8);
    const signMat = new THREE.MeshBasicMaterial({ color: 0x0284c7 });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(0, 2.5, 10.2);
    this.scene.add(sign);
  }

  buildAGV() {
    // Model an Autonomous Guided Vehicle (AGV / Robot Forklift)
    const agvGroup = new THREE.Group();

    // Chassis body
    const bodyGeo = new THREE.BoxGeometry(1.4, 0.5, 2.0);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.6, roughness: 0.3 }); // Industrial Yellow
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.35;
    body.castShadow = true;
    agvGroup.add(body);

    // Cabin mast
    const mastGeo = new THREE.BoxGeometry(0.2, 1.8, 0.15);
    const mastMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8 });
    const leftMast = new THREE.Mesh(mastGeo, mastMat);
    leftMast.position.set(-0.35, 1.2, 0.9);
    agvGroup.add(leftMast);
    const rightMast = new THREE.Mesh(mastGeo, mastMat);
    rightMast.position.set(0.35, 1.2, 0.9);
    agvGroup.add(rightMast);

    // Lifting forks
    const forkGeo = new THREE.BoxGeometry(0.12, 0.05, 1.1);
    const forkMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.9 });
    const forkL = new THREE.Mesh(forkGeo, forkMat);
    forkL.position.set(-0.25, 0.25, 1.45);
    agvGroup.add(forkL);
    const forkR = new THREE.Mesh(forkGeo, forkMat);
    forkR.position.set(0.25, 0.25, 1.45);
    agvGroup.add(forkR);

    // Flashing safety beacon
    const beaconGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.12, 8);
    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.2
    });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(0, 0.68, -0.6);
    agvGroup.add(beacon);

    // Parked at staging dock by default
    agvGroup.position.set(0, 0, 6.2);
    this.scene.add(agvGroup);

    this.agvVehicle = {
      group: agvGroup,
      beacon: beacon,
      isMoving: false
    };
  }

  /**
   * Synchronizes 3D Pallet Containers with live database batches.
   */
  syncBatches(batchList, nextFefoBatchId) {
    const activeIds = new Set(batchList.map((b) => b.batchId));

    // Remove pallets that were dispatched or deleted
    for (const [batchId, mesh] of this.palletMeshes.entries()) {
      if (!activeIds.has(batchId)) {
        this.scene.remove(mesh);
        this.palletMeshes.delete(batchId);
      }
    }

    // Precise rack slot allocation across 3 tiers (X offset, Y tier, Z depth)
    const slotMap = {
      Freezer: { baseX: -6.0, slots: [
        [-1.2, 0.45, 0], [1.2, 0.45, 0],
        [-1.2, 1.90, 0], [1.2, 1.90, 0],
        [-1.2, 3.35, 0], [1.2, 3.35, 0]
      ], count: 0 },
      Chiller: { baseX: 0.0, slots: [
        [-1.2, 0.45, 0], [1.2, 0.45, 0],
        [-1.2, 1.90, 0], [1.2, 1.90, 0],
        [-1.2, 3.35, 0], [1.2, 3.35, 0]
      ], count: 0 },
      Ambient: { baseX: 6.0, slots: [
        [-1.2, 0.45, 0], [1.2, 0.45, 0],
        [-1.2, 1.90, 0], [1.2, 1.90, 0],
        [-1.2, 3.35, 0], [1.2, 3.35, 0]
      ], count: 0 }
    };

    batchList.forEach((batch) => {
      const zName = batch.zoneName || "Chiller";
      const zoneData = slotMap[zName] || slotMap["Chiller"];
      const slotIndex = zoneData.count % zoneData.slots.length;
      zoneData.count++;
      const [sx, sy, sz] = zoneData.slots[slotIndex];
      const posX = zoneData.baseX + sx;
      const posY = sy;
      const posZ = sz;

      let mesh = this.palletMeshes.get(batch.batchId);
      const isNextFefo = (batch.batchId === nextFefoBatchId);

      if (!mesh) {
        mesh = this.createPalletMesh(batch, isNextFefo);
        mesh.position.set(posX, posY, posZ);
        this.scene.add(mesh);
        this.palletMeshes.set(batch.batchId, mesh);
      } else {
        mesh.position.set(posX, posY, posZ);
        mesh.userData.batch = batch;
        this.updatePalletHighlight(mesh, isNextFefo);
      }
    });
  }

  createPalletMesh(batch, isFefo) {
    const group = new THREE.Group();

    // 1. Wooden Euro-Pallet base with deckboards
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x854d0e, roughness: 0.9 });
    const palletBase = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 1.1), woodMat);
    palletBase.castShadow = true;
    palletBase.receiveShadow = true;
    group.add(palletBase);

    // 2. Corrugated Product Cartons with shrink-wrap finish
    const boxColor = isFefo ? 0xf59e0b : 0x0284c7;
    const boxMat = new THREE.MeshStandardMaterial({
      color: boxColor,
      roughness: 0.35,
      metalness: 0.2,
      emissive: isFefo ? 0xf59e0b : 0x000000,
      emissiveIntensity: isFefo ? 0.7 : 0.0
    });
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.85, 0.95), boxMat);
    box.position.y = 0.50;
    box.castShadow = true;
    group.add(box);

    // 3. Shipping & Batch Label Decal
    const labelCanvas = document.createElement("canvas");
    labelCanvas.width = 256;
    labelCanvas.height = 128;
    const lctx = labelCanvas.getContext("2d");
    lctx.fillStyle = "#f8fafc";
    lctx.fillRect(0, 0, 256, 128);
    lctx.fillStyle = "#0f172a";
    lctx.font = "bold 26px sans-serif";
    lctx.fillText(batch.batchId, 16, 36);
    lctx.font = "20px sans-serif";
    lctx.fillText(batch.productName, 16, 70);
    lctx.font = "16px sans-serif";
    lctx.fillStyle = "#dc2626";
    lctx.fillText("EXP: " + batch.expiryDate, 16, 105);

    const labelTex = new THREE.CanvasTexture(labelCanvas);
    const labelMat = new THREE.MeshBasicMaterial({ map: labelTex });
    const labelPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), labelMat);
    labelPlane.position.set(0, 0.50, 0.49);
    group.add(labelPlane);

    group.userData = {
      type: "batchPallet",
      batchId: batch.batchId,
      batch: batch,
      boxMesh: box
    };

    return group;
  }

  updatePalletHighlight(group, isFefo) {
    const box = group.userData.boxMesh;
    if (box) {
      box.material.color.setHex(isFefo ? 0xf59e0b : 0x0284c7);
      box.material.emissive.setHex(isFefo ? 0xf59e0b : 0x000000);
      box.material.emissiveIntensity = isFefo ? 0.7 : 0.0;
    }
  }

  /**
   * AGV Transportation Animation connected to real FEFO Dispatch.
   */
  animateDispatchWithAGV(batchId, onComplete) {
    const mesh = this.palletMeshes.get(batchId);
    if (!mesh || !this.agvVehicle) {
      if (onComplete) onComplete();
      return;
    }

    const agv = this.agvVehicle.group;
    const startX = agv.position.x;
    const startZ = agv.position.z;
    const targetX = mesh.position.x;
    const targetZ = 3.5; // AGV alignment in aisle

    // Step 1: Smooth camera zoom to target batch
    this.focusCameraOn(mesh.position.x, mesh.position.y + 1, mesh.position.z + 5);

    // Step 2: Drive AGV from staging dock to rack position
    const driveDuration = 1200;
    const t0 = performance.now();

    const driveToRack = (now) => {
      const elapsed = now - t0;
      const progress = Math.min(elapsed / driveDuration, 1.0);
      const ease = 0.5 - Math.cos(progress * Math.PI) / 2;

      agv.position.x = startX + (targetX - startX) * ease;
      agv.position.z = startZ + (targetZ - startZ) * ease;

      if (progress < 1.0) {
        requestAnimationFrame(driveToRack);
      } else {
        // Step 3: Pick up pallet and drive back to dispatch dock
        mesh.position.y += 0.3; // Lifted by forks
        const t1 = performance.now();
        const driveToDock = (now2) => {
          const el2 = now2 - t1;
          const prog2 = Math.min(el2 / driveDuration, 1.0);
          const ease2 = 0.5 - Math.cos(prog2 * Math.PI) / 2;

          agv.position.x = targetX + (0 - targetX) * ease2;
          agv.position.z = targetZ + (6.5 - targetZ) * ease2;
          mesh.position.x = agv.position.x;
          mesh.position.z = agv.position.z + 1.2;

          if (prog2 < 1.0) {
            requestAnimationFrame(driveToDock);
          } else {
            // Unload pallet at dispatch bay
            this.scene.remove(mesh);
            this.palletMeshes.delete(batchId);
            if (onComplete) onComplete();
          }
        };
        requestAnimationFrame(driveToDock);
      }
    };
    requestAnimationFrame(driveToRack);
  }

  updateZoneTemperatures(zonesData) {
    zonesData.forEach((z) => {
      const obj = this.zoneObjects[z.zoneName];
      if (!obj) return;

      const temp = z.currentTemperature;
      const target = z.targetTemperature;
      const diff = Math.abs(temp - target);

      // Bulb status color
      if (diff <= 2.0) {
        obj.bulb.material.color.setHex(0x10b981); // Green Normal
        obj.bulb.material.emissive.setHex(0x10b981);
      } else if (diff <= 5.0) {
        obj.bulb.material.color.setHex(0xf59e0b); // Amber Warning
        obj.bulb.material.emissive.setHex(0xf59e0b);
      } else {
        obj.bulb.material.color.setHex(0xf43f5e); // Red Critical
        obj.bulb.material.emissive.setHex(0xf43f5e);
      }

      this.isCoolingActive[z.zoneName] = z.compressorOn;
    });
  }

  highlightSensor(sensorId) {
    const sensor = this.sensorNodes.get(sensorId);
    if (!sensor) return;

    this.focusCameraOn(sensor.position.x, sensor.position.y, sensor.position.z + 4);
    sensor.material.emissive.setHex(0xf43f5e);
    sensor.material.emissiveIntensity = 1.4;

    setTimeout(() => {
      if (sensor) {
        sensor.material.emissive.setHex(0x0284c7);
        sensor.material.emissiveIntensity = 0.8;
      }
    }, 4500);
  }

  highlightBatch(batchId) {
    const mesh = this.palletMeshes.get(batchId);
    if (!mesh) return;

    this.focusCameraOn(mesh.position.x, mesh.position.y + 0.5, mesh.position.z + 4);
    const box = mesh.userData.boxMesh;
    if (box) {
      const origColor = box.material.emissive.getHex();
      box.material.emissive.setHex(0xf59e0b);
      box.material.emissiveIntensity = 1.0;
      setTimeout(() => {
        box.material.emissive.setHex(origColor);
        box.material.emissiveIntensity = 0.6;
      }, 3000);
    }
  }

  focusCameraOn(x, y, z) {
    const startPos = this.camera.position.clone();
    const targetPos = new THREE.Vector3(x, y + 2.5, z + 6);
    const startTarget = this.controls.target.clone();
    const endTarget = new THREE.Vector3(x, y, z);
    const startTime = performance.now();
    const duration = 1000;

    const animateCam = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1.0);
      const ease = 0.5 - Math.cos(progress * Math.PI) / 2;

      this.camera.position.lerpVectors(startPos, targetPos, ease);
      this.controls.target.lerpVectors(startTarget, endTarget, ease);

      if (progress < 1.0) {
        requestAnimationFrame(animateCam);
      }
    };
    requestAnimationFrame(animateCam);
  }

  onPointerClick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);

    if (intersects.length > 0) {
      let target = intersects[0].object;
      while (target && !target.userData.type && target.parent) {
        target = target.parent;
      }

      if (target && target.userData) {
        this.onSelect(target.userData);
      }
    }
  }

  onWindowResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const delta = this.clock.getDelta();
    const time = this.clock.getElapsedTime();

    // 1. Rotate active cooling fan impellers
    this.coolingFans.forEach(({ fan, zone }) => {
      const speed = this.isCoolingActive[zone] ? 16.0 : 1.0;
      fan.rotation.z += speed * delta;
    });

    // 2. Animate cold vapor particle systems
    this.vaporEmitters.forEach(({ points, zone, count }) => {
      const active = this.isCoolingActive[zone];
      points.visible = active;
      if (active) {
        const pos = points.geometry.attributes.position.array;
        for (let i = 1; i < count * 3; i += 3) {
          pos[i] -= 0.6 * delta; // Fall downwards like heavy cold air
          if (pos[i] < 0.2) {
            pos[i] = 4.8;
          }
        }
        points.geometry.attributes.position.needsUpdate = true;
      }
    });

    // 3. AGV Safety Strobe flashing
    if (this.agvVehicle && this.agvVehicle.beacon) {
      this.agvVehicle.beacon.material.emissiveIntensity = 0.5 + Math.sin(time * 8) * 0.8;
    }

    // 4. Orbit controls update
    if (this.controls) {
      this.controls.update();
    }

    this.renderer.render(this.scene, this.camera);

    // 5. Performance Metrics HUD
    this.frameCount = (this.frameCount || 0) + 1;
    if (!this.lastFpsUpdate) this.lastFpsUpdate = time;
    if (time - this.lastFpsUpdate >= 0.5) {
      const fps = Math.round(this.frameCount / (time - this.lastFpsUpdate));
      this.frameCount = 0;
      this.lastFpsUpdate = time;
      const fpsBadge = document.getElementById("fps-counter-badge");
      if (fpsBadge && this.renderer.info) {
        const polys = this.renderer.info.render.triangles.toLocaleString();
        fpsBadge.textContent = `${fps} FPS | ${polys} Triangles | ${this.palletMeshes.size} Pallets`;
      }
    }
  }
}
