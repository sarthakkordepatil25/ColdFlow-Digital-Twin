/**
 * ColdFlow 3D Warehouse Digital Twin Engine
 *
 * Implements:
 * 1. Industrial 3-Chamber Cold-Chain Architecture (Freezer, Chiller, Ambient)
 *    matching the high-fidelity reference design.
 * 2. Neon-illuminated entrance arches and glowing floor perimeters for each chamber:
 *    - Freezer: Cyber Cyan / Sub-Zero Neon Blue (#00f0ff)
 *    - Chiller: Emerald / High-Luminance Neon Green (#00ff66)
 *    - Ambient: Vibrant Neon Red / Amber (#ff2a5f)
 * 3. Overhead illuminated chamber identification signage ("FREEZER", "CHILLER", "AMBIENT").
 * 4. Multi-fan industrial refrigeration condenser units on back walls with live spinning rotors.
 * 5. Industrial heavy-duty pallet racks loaded with zone-appropriate goods and live database batches.
 * 6. Polished epoxy floor with yellow AGV guidance tracks, safety barriers, and service doors.
 * 7. Autonomous Guided Vehicle (AGV) with flashing amber beacon and smooth dispatch trajectory.
 * 8. 9 IoT Environmental Sensors (SENSOR01-09) with interactive raycasting.
 * 9. Sub-zero vapor particles reacting dynamically to compressor cooling state.
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
    this.stockPalletMap = new Map();   // slotId -> Group
    this.coolingFans = [];             // { fan, zone }
    this.vaporEmitters = [];           // { points, zone, count }
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
    this.scene.background = new THREE.Color(0x060b14);
    this.scene.fog = new THREE.FogExp2(0x060b14, 0.014);

    // 2. Camera setup matching the isometric elevated perspective in reference image
    const w = this.container.clientWidth || 1200;
    const h = this.container.clientHeight || 500;
    const aspect = w / h;
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 200);
    this.camera.position.set(0, 14.5, 23.5);

    // 3. Renderer setup
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      alpha: false
    });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.container.appendChild(this.renderer.domElement);

    // 4. Orbit Controls
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02; // Prevent floor clipping
    this.controls.minDistance = 4;
    this.controls.maxDistance = 60;
    this.controls.target.set(0, 2.2, 0);

    // 5. Generate Textures
    this.generateProceduralTextures();

    // 6. Lighting Pipeline
    this.setupLighting();

    // 7. Build Architecture
    this.buildWarehouseArchitecture();

    // 8. Build AGV Autonomous Forklift
    this.buildAGV();

    // 9. Event Listeners
    window.addEventListener("resize", () => this.onWindowResize());
    this.renderer.domElement.addEventListener("click", (e) => this.onPointerClick(e));

    // 10. Start Animation Loop
    this.animate();
  }

  generateProceduralTextures() {
    // 1. Polished industrial floor with subtle grid lines
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d");

    // Base concrete dark tone
    ctx.fillStyle = "#0c1526";
    ctx.fillRect(0, 0, 1024, 1024);

    // Subtle noise
    ctx.fillStyle = "rgba(255, 255, 255, 0.015)";
    for (let i = 0; i < 4000; i++) {
      ctx.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2);
    }

    // Grid joint lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 2;
    for (let x = 0; x <= 1024; x += 128) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 1024); ctx.stroke();
    }
    for (let y = 0; y <= 1024; y += 128) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1024, y); ctx.stroke();
    }

    const floorTex = new THREE.CanvasTexture(canvas);
    floorTex.wrapS = THREE.RepeatWrapping;
    floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(6, 4);
    this.textures.floor = floorTex;

    // 2. Yellow Hazard Striping
    const hazardCanvas = document.createElement("canvas");
    hazardCanvas.width = 256;
    hazardCanvas.height = 256;
    const hctx = hazardCanvas.getContext("2d");
    hctx.fillStyle = "#eab308";
    hctx.fillRect(0, 0, 256, 256);
    hctx.fillStyle = "#18181b";
    for (let i = -256; i < 512; i += 48) {
      hctx.beginPath();
      hctx.moveTo(i, 0);
      hctx.lineTo(i + 24, 0);
      hctx.lineTo(i - 24, 256);
      hctx.lineTo(i - 48, 256);
      hctx.fill();
    }
    const hazardTex = new THREE.CanvasTexture(hazardCanvas);
    hazardTex.wrapS = THREE.RepeatWrapping;
    hazardTex.wrapT = THREE.RepeatWrapping;
    hazardTex.repeat.set(10, 1);
    this.textures.hazard = hazardTex;
  }

  setupLighting() {
    // Ambient illumination
    const ambLight = new THREE.AmbientLight(0x131f37, 1.4);
    this.scene.add(ambLight);

    // Main Directional Sun Light (casting realistic soft shadows)
    const mainSun = new THREE.DirectionalLight(0xf1f5f9, 1.6);
    mainSun.position.set(10, 24, 18);
    mainSun.castShadow = true;
    mainSun.shadow.mapSize.width = 2048;
    mainSun.shadow.mapSize.height = 2048;
    mainSun.shadow.camera.near = 0.5;
    mainSun.shadow.camera.far = 80;
    const d = 22;
    mainSun.shadow.camera.left = -d;
    mainSun.shadow.camera.right = d;
    mainSun.shadow.camera.top = d;
    mainSun.shadow.camera.bottom = -d;
    mainSun.shadow.bias = -0.0003;
    this.scene.add(mainSun);

    // Subtle fill light from front-left
    const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.4);
    fillLight.position.set(-15, 12, 10);
    this.scene.add(fillLight);

    // Dedicated interior zone lights
    // Zone 1: Sub-zero Blue Cold illumination (Freezer, X = -7.2)
    const freezerLight = new THREE.PointLight(0x38bdf8, 2.6, 18);
    freezerLight.position.set(-7.2, 5.0, 0);
    this.scene.add(freezerLight);

    // Zone 2: Fresh Refrigerated Green illumination (Chiller, X = 0)
    const chillerLight = new THREE.PointLight(0x22c55e, 2.2, 18);
    chillerLight.position.set(0, 5.0, 0);
    this.scene.add(chillerLight);

    // Zone 3: Warm Industrial Warehouse illumination (Ambient, X = +7.2)
    const ambientLight = new THREE.PointLight(0xef4444, 2.0, 18);
    ambientLight.position.set(7.2, 5.0, 0);
    this.scene.add(ambientLight);

    // Apron high-bay lights
    [-7.2, 0, 7.2].forEach((px) => {
      const pLight = new THREE.PointLight(0xffeedd, 0.7, 12);
      pLight.position.set(px, 7.5, 6.5);
      this.scene.add(pLight);
    });
  }

  buildWarehouseArchitecture() {
    // 1. Industrial Concrete Epoxy Floor (Main Base)
    const floorGeo = new THREE.PlaneGeometry(36, 26);
    const floorMat = new THREE.MeshStandardMaterial({
      map: this.textures.floor,
      roughness: 0.45,
      metalness: 0.2
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // 2. Main Yellow AGV Guidance Lanes on Apron
    const trackMat = new THREE.MeshBasicMaterial({ color: 0xeab308 });
    const mainAisleTrack = new THREE.Mesh(new THREE.PlaneGeometry(28, 0.35), trackMat);
    mainAisleTrack.rotation.x = -Math.PI / 2;
    mainAisleTrack.position.set(0, 0.015, 6.2);
    this.scene.add(mainAisleTrack);

    // Spur branches leading into each chamber
    [-7.2, 0, 7.2].forEach((tx) => {
      const spurTrack = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 6.0), trackMat);
      spurTrack.rotation.x = -Math.PI / 2;
      spurTrack.position.set(tx, 0.016, 3.2);
      this.scene.add(spurTrack);
    });

    // 3. Staging dock line with hazard crosshatch at Z = 8.8
    const hazardGeo = new THREE.PlaneGeometry(30, 0.5);
    const hazardMat = new THREE.MeshBasicMaterial({ map: this.textures.hazard });
    const hazardLine = new THREE.Mesh(hazardGeo, hazardMat);
    hazardLine.rotation.x = -Math.PI / 2;
    hazardLine.position.set(0, 0.02, 8.8);
    this.scene.add(hazardLine);

    // 4. Back Continuous Insulated Wall
    const backWallMat = new THREE.MeshStandardMaterial({
      color: 0x111c30,
      roughness: 0.75,
      metalness: 0.2
    });
    const backWallGeo = new THREE.BoxGeometry(34, 8.5, 0.3);
    const backWall = new THREE.Mesh(backWallGeo, backWallMat);
    backWall.position.set(0, 4.25, -5.2);
    backWall.receiveShadow = true;
    this.scene.add(backWall);

    // Side Exterior Walls
    const sideWallGeo = new THREE.BoxGeometry(0.3, 8.5, 18);
    const leftWall = new THREE.Mesh(sideWallGeo, backWallMat);
    leftWall.position.set(-15.5, 4.25, 3.8);
    leftWall.receiveShadow = true;
    this.scene.add(leftWall);

    const rightWall = new THREE.Mesh(sideWallGeo, backWallMat);
    rightWall.position.set(15.5, 4.25, 3.8);
    rightWall.receiveShadow = true;
    this.scene.add(rightWall);

    // Architectural Columns along side walls
    const colMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6, metalness: 0.4 });
    [-15.3, 15.3].forEach((cx) => {
      for (let cz = -4; cz <= 10; cz += 3.5) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.4, 8.5, 0.4), colMat);
        col.position.set(cx, 4.25, cz);
        this.scene.add(col);
      }
    });

    // 5. Partition Walls Between Chambers (at X = -3.6 and X = +3.6)
    const partitionMat = new THREE.MeshStandardMaterial({
      color: 0x16233b,
      roughness: 0.7,
      metalness: 0.2
    });
    [-3.6, 3.6].forEach((px) => {
      const part = new THREE.Mesh(new THREE.BoxGeometry(0.3, 7.2, 9.8), partitionMat);
      part.position.set(px, 3.6, -0.3);
      part.castShadow = true;
      part.receiveShadow = true;
      this.scene.add(part);

      // Clean top aluminum cap
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 9.8), new THREE.MeshStandardMaterial({
        color: 0x64748b, metalness: 0.8, roughness: 0.2
      }));
      cap.position.set(px, 7.25, -0.3);
      this.scene.add(cap);
    });

    // 6. Overhead Steel Trusses above partition lines
    const trussMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.3 });
    [-4.0, 0.0, 4.0].forEach((tz) => {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(32, 0.3, 0.25), trussMat);
      beam.position.set(0, 8.0, tz);
      this.scene.add(beam);
    });

    // 7. BUILD THE THREE CORE STORAGE CHAMBERS
    // Chamber 1: FREEZER (Left: X = -7.2, Color = Cyan 0x00f0ff)
    this.buildStorageChamber("Freezer", -7.2, 0x00f0ff, 0x1d4ed8, -20.0, true);

    // Chamber 2: CHILLER (Center: X = 0.0, Color = Neon Green 0x00ff66)
    this.buildStorageChamber("Chiller", 0.0, 0x00ff66, 0x15803d, 4.0, false);

    // Chamber 3: AMBIENT (Right: X = +7.2, Color = Neon Red 0xff2a5f)
    this.buildStorageChamber("Ambient", 7.2, 0xff2a5f, 0xb91c1c, 25.0, false);

    // 8. Staging Safety Barriers with Metallic Railings in Front of Each Bay
    this.buildSafetyBarriers();

    // 9. Build 9 IoT Environmental Sensors
    this.buildSensorNodes();
  }

  buildStorageChamber(zoneName, xPos, neonHex, darkThemeHex, targetTemp, isFreezer) {
    const chamberGroup = new THREE.Group();
    chamberGroup.position.set(xPos, 0, 0);

    const roomW = 6.4;
    const roomD = 9.4;
    const roomH = 6.8;

    // 1. Zoned Floor Slab with subtle zone tint
    const slabMat = new THREE.MeshStandardMaterial({
      color: isFreezer ? 0x0c1b30 : (zoneName === "Chiller" ? 0x0d241c : 0x241515),
      roughness: 0.5,
      metalness: 0.25
    });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(roomW - 0.3, 0.06, roomD - 0.2), slabMat);
    slab.position.set(0, 0.03, -0.3);
    slab.receiveShadow = true;
    chamberGroup.add(slab);

    // 2. GLOWING NEON ENTRANCE PORTAL & FLOOR PERIMETER
    const neonMat = new THREE.MeshBasicMaterial({
      color: neonHex,
      toneMapped: false
    });
    const glowMat = new THREE.MeshBasicMaterial({
      color: neonHex,
      transparent: true,
      opacity: 0.38,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      depthWrite: false
    });

    const portalZ = 4.4;
    const portalH = 6.2;
    const halfW = (roomW - 0.4) / 2;

    // Helper to add neon tube with glow shell
    const addNeonTube = (r, len, posX, posY, posZ, rotZ = 0, rotX = 0) => {
      const core = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), neonMat);
      core.position.set(posX, posY, posZ);
      if (rotZ) core.rotation.z = rotZ;
      if (rotX) core.rotation.x = rotX;
      chamberGroup.add(core);

      const halo = new THREE.Mesh(new THREE.CylinderGeometry(r * 2.2, r * 2.2, len, 8), glowMat);
      halo.position.set(posX, posY, posZ);
      if (rotZ) halo.rotation.z = rotZ;
      if (rotX) halo.rotation.x = rotX;
      chamberGroup.add(halo);
    };

    // Left vertical neon arch post
    addNeonTube(0.04, portalH, -halfW, portalH / 2, portalZ);
    // Right vertical neon arch post
    addNeonTube(0.04, portalH, halfW, portalH / 2, portalZ);
    // Top horizontal neon arch lintel
    addNeonTube(0.04, roomW - 0.4, 0, portalH, portalZ, Math.PI / 2, 0);

    // Glowing floor perimeter along left and right side walls
    addNeonTube(0.025, roomD - 0.4, -halfW, 0.04, -0.3, 0, Math.PI / 2);
    addNeonTube(0.025, roomD - 0.4, halfW, 0.04, -0.3, 0, Math.PI / 2);

    // Front threshold neon strip
    addNeonTube(0.03, roomW - 0.4, 0, 0.04, portalZ, Math.PI / 2, 0);

    // 3. OVERHEAD ILLUMINATED SIGN BOX ("FREEZER", "CHILLER", "AMBIENT")
    const signCanvas = document.createElement("canvas");
    signCanvas.width = 512;
    signCanvas.height = 140;
    const sctx = signCanvas.getContext("2d");

    const hexStr = `#${neonHex.toString(16).padStart(6, "0")}`;
    sctx.fillStyle = "#070e1d";
    sctx.fillRect(10, 10, 492, 120);

    // Vibrant glowing border
    sctx.strokeStyle = hexStr;
    sctx.lineWidth = 10;
    sctx.strokeRect(10, 10, 492, 120);

    // Inner tint fill
    sctx.fillStyle = hexStr === "#00f0ff" ? "rgba(0, 140, 255, 0.25)" : (hexStr === "#00ff66" ? "rgba(0, 200, 80, 0.25)" : "rgba(220, 30, 60, 0.25)");
    sctx.fillRect(16, 16, 480, 108);

    // Bold title text
    sctx.fillStyle = "#ffffff";
    sctx.font = "bold 64px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    sctx.textAlign = "center";
    sctx.textBaseline = "middle";
    sctx.fillText(zoneName.toUpperCase(), 256, 70);

    const signTex = new THREE.CanvasTexture(signCanvas);
    const signMat = new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false });
    const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.75), signMat);
    signMesh.position.set(0, portalH + 0.5, portalZ + 0.02);
    chamberGroup.add(signMesh);

    // 4. BACK WALL SERVICE DOORS & CONDENSER UNIT
    const doorFrameMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.3 });
    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(2.0, 3.2, 0.08), doorFrameMat);
    doorFrame.position.set(0, 1.6, -4.95);
    chamberGroup.add(doorFrame);

    const doorLeafMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.5, roughness: 0.4 });
    const doorLeafL = new THREE.Mesh(new THREE.BoxGeometry(0.9, 3.0, 0.06), doorLeafMat);
    doorLeafL.position.set(-0.48, 1.6, -4.93);
    chamberGroup.add(doorLeafL);
    const doorLeafR = new THREE.Mesh(new THREE.BoxGeometry(0.9, 3.0, 0.06), doorLeafMat);
    doorLeafR.position.set(0.48, 1.6, -4.93);
    chamberGroup.add(doorLeafR);

    // 5. INDUSTRIAL 4-FAN CONDENSER / EVAPORATOR UNIT MOUNTED ON BACK WALL
    this.buildBackWallCondenser(chamberGroup, zoneName, neonHex);

    // 6. BUILD STORAGE PALLET RACKS INSIDE CHAMBER
    this.buildChamberRacks(chamberGroup, zoneName, isFreezer);

    // 7. Cold vapor emitter for Freezer and Chiller
    if (isFreezer || zoneName === "Chiller") {
      const vaporCount = 50;
      const vaporGeo = new THREE.BufferGeometry();
      const positions = new Float32Array(vaporCount * 3);
      for (let i = 0; i < vaporCount * 3; i += 3) {
        positions[i] = (Math.random() - 0.5) * (roomW - 1.2);
        positions[i + 1] = 4.5 - Math.random() * 2.8;
        positions[i + 2] = -3.5 + Math.random() * 7.0;
      }
      vaporGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const vaporMat = new THREE.PointsMaterial({
        color: isFreezer ? 0xbae6fd : 0xa7f3d0,
        size: 0.16,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending
      });
      const vaporPoints = new THREE.Points(vaporGeo, vaporMat);
      chamberGroup.add(vaporPoints);
      this.vaporEmitters.push({ points: vaporPoints, zone: zoneName, count: vaporCount });
    }

    // 8. Indicator bulb on portal header (clickable for zone diagnostics)
    const bulbGeo = new THREE.SphereGeometry(0.18, 16, 16);
    const bulbMat = new THREE.MeshStandardMaterial({
      color: neonHex,
      emissive: neonHex,
      emissiveIntensity: 0.8
    });
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(0, portalH + 0.95, portalZ);
    bulb.userData = { type: "indicatorBulb", zoneName: zoneName };
    chamberGroup.add(bulb);

    this.scene.add(chamberGroup);
    this.zoneObjects[zoneName] = {
      group: chamberGroup,
      bulb: bulb,
      targetTemp: targetTemp,
      neonHex: neonHex
    };
  }

  buildBackWallCondenser(parentGroup, zoneName, neonHex) {
    const unitGroup = new THREE.Group();
    unitGroup.position.set(0, 5.2, -4.75);

    const unitW = 4.2;
    const unitH = 1.1;
    const unitD = 0.5;

    const caseMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.85,
      roughness: 0.3
    });
    const casing = new THREE.Mesh(new THREE.BoxGeometry(unitW, unitH, unitD), caseMat);
    casing.castShadow = true;
    unitGroup.add(casing);

    // Front trim strip in signature zone color
    const trimMat = new THREE.MeshStandardMaterial({
      color: neonHex,
      emissive: neonHex,
      emissiveIntensity: 0.25,
      metalness: 0.5
    });
    const trim = new THREE.Mesh(new THREE.BoxGeometry(unitW, 0.06, 0.02), trimMat);
    trim.position.set(0, unitH / 2 - 0.04, unitD / 2 + 0.01);
    unitGroup.add(trim);

    // 4 circular fan ports
    const fanPositions = [-1.4, -0.46, 0.46, 1.4];
    const shroudMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.2 });
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.8,
      roughness: 0.25,
      side: THREE.DoubleSide
    });

    fanPositions.forEach((fx) => {
      // Circular shroud
      const shroud = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.04, 12, 24), shroudMat);
      shroud.position.set(fx, 0, unitD / 2 + 0.02);
      unitGroup.add(shroud);

      // Rotating fan rotor with 4 blades
      const rotor = new THREE.Group();
      rotor.position.set(fx, 0, unitD / 2 + 0.03);

      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 16), bladeMat);
      hub.rotation.x = Math.PI / 2;
      rotor.add(hub);

      for (let b = 0; b < 4; b++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.32, 0.015), bladeMat);
        blade.position.y = 0.16;
        const bladeHolder = new THREE.Group();
        bladeHolder.rotation.z = (b * Math.PI) / 2;
        bladeHolder.add(blade);
        rotor.add(bladeHolder);
      }

      unitGroup.add(rotor);
      this.coolingFans.push({ fan: rotor, zone: zoneName });

      // Protective wire grille
      const wireMat = new THREE.MeshBasicMaterial({ color: 0x64748b });
      const wireH = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.01, 0.01), wireMat);
      wireH.position.set(fx, 0, unitD / 2 + 0.05);
      unitGroup.add(wireH);
      const wireV = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.74, 0.01), wireMat);
      wireV.position.set(fx, 0, unitD / 2 + 0.05);
      unitGroup.add(wireV);
    });

    parentGroup.add(unitGroup);
  }

  buildChamberRacks(chamberGroup, zoneName, isFreezer) {
    const uprightMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, metalness: 0.7, roughness: 0.3 });
    const beamMat = new THREE.MeshStandardMaterial({ color: 0xea580c, metalness: 0.6, roughness: 0.35 });

    // 3 parallel rack rows per chamber
    const rowXPositions = [-1.85, 0.0, 1.85];
    const rackDepth = 7.0;
    const rackHeight = 4.6;
    const tierHeights = [0.4, 1.75, 3.1];
    const depthPositions = [-2.4, -0.8, 0.8, 2.4];

    rowXPositions.forEach((rx, rIdx) => {
      const rackGroup = new THREE.Group();
      rackGroup.position.set(rx, 0, -0.4);

      // Upright vertical posts (6 per rack row)
      const postGeo = new THREE.BoxGeometry(0.08, rackHeight, 0.08);
      const halfW = 0.6;
      const halfD = rackDepth / 2;
      const cornerOffsets = [
        [-halfW, -halfD], [halfW, -halfD],
        [-halfW, 0], [halfW, 0],
        [-halfW, halfD], [halfW, halfD]
      ];

      cornerOffsets.forEach(([cx, cz]) => {
        const post = new THREE.Mesh(postGeo, uprightMat);
        post.position.set(cx, rackHeight / 2, cz);
        post.castShadow = true;
        rackGroup.add(post);
      });

      // Horizontal load beams across tiers
      tierHeights.forEach((ty) => {
        const shelfBeam = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2 + 0.04, 0.08, rackDepth), beamMat);
        shelfBeam.position.set(0, ty, 0);
        shelfBeam.castShadow = true;
        shelfBeam.receiveShadow = true;
        rackGroup.add(shelfBeam);
      });

      // Prepopulate background storage pallets so racks look full and realistic
      tierHeights.forEach((ty, tIdx) => {
        depthPositions.forEach((pz, pIdx) => {
          const slotId = `${zoneName}_${rIdx}_${tIdx}_${pIdx}`;
          const stockPallet = this.createStockPalletMesh(zoneName, isFreezer, tIdx + pIdx + rIdx);
          stockPallet.position.set(0, ty + 0.04, pz);
          rackGroup.add(stockPallet);
          this.stockPalletMap.set(slotId, stockPallet);
        });
      });

      chamberGroup.add(rackGroup);
    });
  }

  createStockPalletMesh(zoneName, isFreezer, seed) {
    const palletGroup = new THREE.Group();

    // Wooden pallet base
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
    const palletBase = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 0.95), woodMat);
    palletBase.position.y = 0.05;
    palletBase.castShadow = true;
    palletGroup.add(palletBase);

    // Palletized goods color scheme depending on zone
    let boxColor = 0x0284c7;
    if (zoneName === "Chiller") {
      boxColor = seed % 2 === 0 ? 0x16a34a : 0xca8a04; // Green and yellow produce/dairy boxes
    } else if (zoneName === "Ambient") {
      boxColor = seed % 2 === 0 ? 0xd97706 : 0xb45309; // Corrugated cardboard cartons
    } else {
      boxColor = seed % 2 === 0 ? 0x0284c7 : 0x38bdf8; // Frozen cold goods
    }

    const boxMat = new THREE.MeshStandardMaterial({
      color: boxColor,
      roughness: 0.5,
      metalness: 0.1
    });

    // 2-layer stacked cartons on pallet
    const carton1 = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.45, 0.85), boxMat);
    carton1.position.y = 0.32;
    carton1.castShadow = true;
    palletGroup.add(carton1);

    const carton2 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 0.8), boxMat);
    carton2.position.y = 0.72;
    carton2.castShadow = true;
    palletGroup.add(carton2);

    return palletGroup;
  }

  buildSafetyBarriers() {
    const barrierMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.3 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.95, roughness: 0.15 });

    [-7.2, 0, 7.2].forEach((bx) => {
      // Left barrier post
      const postL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.2), barrierMat);
      postL.position.set(bx - 1.8, 0.375, 5.0);
      this.scene.add(postL);

      // Right barrier post
      const postR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.2), barrierMat);
      postR.position.set(bx + 1.8, 0.375, 5.0);
      this.scene.add(postR);

      // Short guard rails
      const railL = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 12), railMat);
      railL.rotation.z = Math.PI / 2;
      railL.position.set(bx - 2.25, 0.65, 5.0);
      this.scene.add(railL);

      const railR = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 12), railMat);
      railR.rotation.z = Math.PI / 2;
      railR.position.set(bx + 2.25, 0.65, 5.0);
      this.scene.add(railR);
    });
  }

  buildSensorNodes() {
    // 9 IoT Sensors distributed across warehouse zones
    const sensorConfig = [
      { id: "SENSOR01", x: -9.0, y: 2.8, z: -1.0, zone: "Freezer" },
      { id: "SENSOR02", x: -7.2, y: 5.6, z: -4.5, zone: "Freezer" },
      { id: "SENSOR03", x: -5.4, y: 2.8, z: 2.0, zone: "Freezer" },
      { id: "SENSOR04", x: -1.8, y: 2.8, z: -1.0, zone: "Chiller" },
      { id: "SENSOR05", x: 0.0, y: 5.6, z: -4.5, zone: "Chiller" },
      { id: "SENSOR06", x: 1.8, y: 2.8, z: 2.0, zone: "Chiller" },
      { id: "SENSOR07", x: 5.4, y: 2.8, z: -1.0, zone: "Ambient" },
      { id: "SENSOR08", x: 7.2, y: 5.6, z: -4.5, zone: "Ambient" },
      { id: "SENSOR09", x: 9.0, y: 2.8, z: 2.0, zone: "Ambient" }
    ];

    const sensorGeo = new THREE.OctahedronGeometry(0.22);
    sensorConfig.forEach((cfg) => {
      const sensorMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.9,
        roughness: 0.1
      });
      const mesh = new THREE.Mesh(sensorGeo, sensorMat);
      mesh.position.set(cfg.x, cfg.y, cfg.z);
      mesh.userData = { type: "sensor", sensorId: cfg.id, zone: cfg.zone };
      this.scene.add(mesh);
      this.sensorNodes.set(cfg.id, mesh);
    });
  }

  buildAGV() {
    const agvGroup = new THREE.Group();

    // Chassis Body
    const bodyGeo = new THREE.BoxGeometry(1.3, 0.5, 1.8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.6, roughness: 0.3 }); // Yellow
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.35;
    body.castShadow = true;
    agvGroup.add(body);

    // Front bumper / counterbalance in dark charcoal
    const bumperMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8 });
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.3, 0.4), bumperMat);
    bumper.position.set(0, 0.35, -0.8);
    agvGroup.add(bumper);

    // Cabin mast assembly
    const mastGeo = new THREE.BoxGeometry(0.12, 1.6, 0.12);
    const mastL = new THREE.Mesh(mastGeo, bumperMat);
    mastL.position.set(-0.35, 1.1, 0.8);
    agvGroup.add(mastL);
    const mastR = new THREE.Mesh(mastGeo, bumperMat);
    mastR.position.set(0.35, 1.1, 0.8);
    agvGroup.add(mastR);

    // Lifting forks
    const forkMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.9, roughness: 0.15 });
    const forkGeo = new THREE.BoxGeometry(0.12, 0.05, 1.1);
    const forkL = new THREE.Mesh(forkGeo, forkMat);
    forkL.position.set(-0.24, 0.22, 1.35);
    agvGroup.add(forkL);
    const forkR = new THREE.Mesh(forkGeo, forkMat);
    forkR.position.set(0.24, 0.22, 1.35);
    agvGroup.add(forkR);

    // Flashing amber safety beacon
    const beaconGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.12, 12);
    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.2
    });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(0, 0.68, -0.4);
    agvGroup.add(beacon);

    // Wheels
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.8 });
    const wheelGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.12, 16);
    [-0.6, 0.6].forEach((wx) => {
      [-0.6, 0.5].forEach((wz) => {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.18, wz);
        agvGroup.add(wheel);
      });
    });

    // Parked in center apron aisle by default (Z = 6.2)
    agvGroup.position.set(0, 0, 6.2);
    this.scene.add(agvGroup);

    this.agvVehicle = {
      group: agvGroup,
      beacon: beacon,
      isMoving: false
    };

    // Secondary forklift in front of Freezer as in reference image
    const forkFreezer = agvGroup.clone();
    forkFreezer.position.set(-6.2, 0, 5.6);
    this.scene.add(forkFreezer);
  }

  /**
   * Synchronizes 3D Pallet Containers with live database batches.
   */
  syncBatches(batchList, nextFefoBatchId) {
    const activeIds = new Set(batchList.map((b) => b.batchId));

    // Remove pallets that were dispatched or deleted
    for (const [batchId, mesh] of this.palletMeshes.entries()) {
      if (!activeIds.has(batchId)) {
        // Restore visibility of underlying stock pallet
        if (mesh.userData.slotId) {
          const stock = this.stockPalletMap.get(mesh.userData.slotId);
          if (stock) stock.visible = true;
        }
        this.scene.remove(mesh);
        this.palletMeshes.delete(batchId);
      }
    }

    // Precise rack slot mapping for each zone (focusing on prominent front and mid slots)
    const slotDefinitions = [
      { rIdx: 1, tIdx: 0, pIdx: 2, rx: 0.0, ty: 0.44, pz: 0.4 },
      { rIdx: 0, tIdx: 0, pIdx: 2, rx: -1.85, ty: 0.44, pz: 0.4 },
      { rIdx: 2, tIdx: 0, pIdx: 2, rx: 1.85, ty: 0.44, pz: 0.4 },
      { rIdx: 1, tIdx: 1, pIdx: 2, rx: 0.0, ty: 1.79, pz: 0.4 },
      { rIdx: 0, tIdx: 1, pIdx: 2, rx: -1.85, ty: 1.79, pz: 0.4 },
      { rIdx: 2, tIdx: 1, pIdx: 2, rx: 1.85, ty: 1.79, pz: 0.4 },
      { rIdx: 1, tIdx: 0, pIdx: 3, rx: 0.0, ty: 0.44, pz: 2.0 },
      { rIdx: 0, tIdx: 0, pIdx: 3, rx: -1.85, ty: 0.44, pz: 2.0 },
      { rIdx: 2, tIdx: 0, pIdx: 3, rx: 1.85, ty: 0.44, pz: 2.0 }
    ];

    const zoneCounters = { Freezer: 0, Chiller: 0, Ambient: 0 };
    const zoneBaseX = { Freezer: -7.2, Chiller: 0.0, Ambient: 7.2 };

    batchList.forEach((batch) => {
      const zName = batch.zoneName || "Chiller";
      const bX = zoneBaseX[zName] !== undefined ? zoneBaseX[zName] : 0.0;
      const slotIdx = (zoneCounters[zName] || 0) % slotDefinitions.length;
      zoneCounters[zName] = (zoneCounters[zName] || 0) + 1;

      const slot = slotDefinitions[slotIdx];
      const slotId = `${zName}_${slot.rIdx}_${slot.tIdx}_${slot.pIdx}`;
      const posX = bX + slot.rx;
      const posY = slot.ty;
      const posZ = slot.pz;

      // Hide background stock pallet at this bay
      const stock = this.stockPalletMap.get(slotId);
      if (stock) stock.visible = false;

      let mesh = this.palletMeshes.get(batch.batchId);
      const isNextFefo = (batch.batchId === nextFefoBatchId);

      if (!mesh) {
        mesh = this.createPalletMesh(batch, isNextFefo);
        mesh.position.set(posX, posY, posZ);
        mesh.userData.slotId = slotId;
        this.scene.add(mesh);
        this.palletMeshes.set(batch.batchId, mesh);
      } else {
        mesh.position.set(posX, posY, posZ);
        mesh.userData.batch = batch;
        mesh.userData.slotId = slotId;
        this.updatePalletHighlight(mesh, isNextFefo);
      }
    });
  }

  createPalletMesh(batch, isFefo) {
    const group = new THREE.Group();

    // 1. Wooden Euro-Pallet base with deckboards
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x854d0e, roughness: 0.9 });
    const palletBase = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 1.05), woodMat);
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
      emissiveIntensity: isFefo ? 0.75 : 0.0
    });
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.85, 0.95), boxMat);
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
      box.material.emissiveIntensity = isFefo ? 0.75 : 0.0;
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
    const targetZ = mesh.position.z + 1.2;

    // Step 1: Smooth camera zoom to target batch
    this.focusCameraOn(mesh.position.x, mesh.position.y + 1, mesh.position.z + 4.5);

    // Step 2: Drive AGV from staging position to rack location
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
        // Step 3: Pick up pallet and drive back to apron staging
        mesh.position.y += 0.3; // Lifted by forks
        const t1 = performance.now();
        const driveToDock = (now2) => {
          const el2 = now2 - t1;
          const prog2 = Math.min(el2 / driveDuration, 1.0);
          const ease2 = 0.5 - Math.cos(prog2 * Math.PI) / 2;

          agv.position.x = targetX + (0 - targetX) * ease2;
          agv.position.z = targetZ + (6.2 - targetZ) * ease2;
          mesh.position.x = agv.position.x;
          mesh.position.z = agv.position.z + 1.1;

          if (prog2 < 1.0) {
            requestAnimationFrame(driveToDock);
          } else {
            // Restore visibility of underlying stock pallet
            if (mesh.userData.slotId) {
              const stock = this.stockPalletMap.get(mesh.userData.slotId);
              if (stock) stock.visible = true;
            }
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
        sensor.material.emissiveIntensity = 0.9;
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

  focusCameraOn(x, y, z, customCamPos = null) {
    const startPos = this.camera.position.clone();
    const targetPos = customCamPos ? customCamPos.clone() : new THREE.Vector3(x, y + 2.5, z + 5.5);
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
    if (w === 0 || h === 0) return;
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
      const speed = this.isCoolingActive[zone] ? 16.0 : 1.5;
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
            pos[i] = 4.5;
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
        fpsBadge.textContent = `${fps} FPS | ${polys} Triangles`;
      }
    }
  }
}
