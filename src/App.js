import React, { Component } from 'react';
import logo from './logo.svg';
import './App.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Graph } from './graph.js';
import { Noise } from 'noisejs';

class App extends Component {
  componentDidMount() {
      //Scene setup
      var auto_rotate = true;

      var scene = new THREE.Scene();
      var camera = new THREE.PerspectiveCamera( 75, window.innerWidth/window.innerHeight, 0.1, 1000 );

      var camera_pivot = new THREE.Object3D();
      var X_AXIS = new THREE.Vector3( 1, 0, 0 );
      var Y_AXIS = new THREE.Vector3( 0, 1, 0 );

      scene.add( camera_pivot );
      camera_pivot.add( camera );
      camera.position.set( 0, 0, 3.5 );
      camera.lookAt( camera_pivot.position );

      {
        const color = 0xFFFFFF;
        const intensity = 0.5;
        const light = new THREE.DirectionalLight(color, intensity);
        light.position.set(-1, 2, 4);
        camera_pivot.add(light);
      }

      camera_pivot.add(new THREE.AmbientLight(0xffffff, 0.5));

      var renderer = new THREE.WebGLRenderer( {antialias: true} );
      renderer.setSize( window.innerWidth, window.innerHeight );
      document.body.appendChild( renderer.domElement );

      var controls = new OrbitControls( camera, renderer.domElement );

      var raycaster = new THREE.Raycaster();
      var mouse = false;

      var group = new THREE.Group();

      // Plant seed
      var geometry = new THREE.SphereBufferGeometry( 0.3, 24, 24 );
      var material = new THREE.MeshPhongMaterial( {color: 0x8b4513} );
      var sphere = new THREE.Mesh( geometry, material );
      group.add( sphere );

      // Distance graph points
      var points = [];
      var noise = new Noise(Math.random());
      for (var x = 0; x < 50; x++) {
        for (var y = 0; y < 50; y++) {
            for (var z = 0; z < 50; z++) {
              var x_ = THREE.MathUtils.mapLinear(x, 0, 49, -2, 2);
              var y_ = THREE.MathUtils.mapLinear(y, 0, 49, -2, 2);
              var z_ = THREE.MathUtils.mapLinear(z, 0, 49, -2, 2);

              var spherical = new THREE.Spherical();
              spherical.setFromCartesianCoords(x_, y_, z_);

              var value = noise.simplex3(spherical.radius * 5.0, spherical.phi, spherical.theta);

              if( spherical.radius < 2 && value > 0.35 ) {
                var temp = new THREE.Vector3();
                temp.x = Math.random() * 0.1 + x_;
                temp.y = Math.random() * 0.1 + y_;
                temp.z = Math.random() * 0.1 + z_;
                points.push(temp);
              }
          }
        }
      }

      var origin = new THREE.Vector3(0., 0., 0.);
      points.unshift(origin);

      scene.add(group);


      // Distance graph calculation
      var dmap = {};

      function getRandomInt(min, max) {
          min = Math.ceil(min);
          max = Math.floor(max);
          return Math.floor(Math.random() * (max - min + 1)) + min;
      }

      for (var i = 0; i < points.length; i++){
        dmap[i] = {};

        var spherical_i = new THREE.Spherical();
        spherical_i.setFromVector3(points[i]);
        var coord2_i = new THREE.Vector2(spherical_i.phi, spherical_i.theta);

        var distances_i = [];

        for (var j = 0; j < points.length; j++){
          if (i !== j) {
            var spherical_j = new THREE.Spherical();
            spherical_j.setFromVector3(points[j]);
            var coord2_j = new THREE.Vector2(spherical_j.phi, spherical_j.theta);

            var d1 = points[i].distanceTo(points[j]);
            var d2 = coord2_i.distanceTo(coord2_j);

            var value = noise.simplex2(spherical_j.phi, spherical_j.theta);
            var rscale = THREE.MathUtils.mapLinear(value, -1, 1, Math.PI / 10, Math.PI / 6);
            var angle = (value > 0? 1: -1) * rscale;

            var rotated_j = new THREE.Vector3();
            rotated_j.copy(points[j]);
            rotated_j.applyEuler(new THREE.Euler( angle, angle, angle ));

            var spherical_rotated_j = new THREE.Spherical();
            spherical_rotated_j.setFromVector3(rotated_j);
            var coord2_rotated_j = new THREE.Vector2(spherical_rotated_j.phi, spherical_rotated_j.theta);

            var d3 = coord2_i.distanceTo(coord2_rotated_j);

            distances_i.push({"index": j, "distance1": d1, "distance2": d2, "distance3": d3});
          }
        }

        if (i == 0) {
          distances_i.sort((a,b) => a.distance1 - b.distance1);
        } else {
          distances_i.sort((a,b) => a.distance3 - b.distance3);
        }

        for (var c = 0; c < 5; c++){
          dmap[i][distances_i[c].index] = distances_i[c].distance1;
        }
      }

      var dgraph = new Graph(dmap);

      // Branch growth function
      var segments = [];

      function growBranch(start, depth) {
        if (depth == 5) return true;

        var distances = [];
        for (var i = 1; i < points.length; i++) {
           var d = start.distanceTo(points[i]);
           distances.push({"index": i, "distance": d});
        }

        distances.sort((a,b) => a.distance - b.distance);

        for (var c = 0; c < 3; c++) {
          var closest_point_index = distances[c].index;
          var closest_point = points[closest_point_index];

          var end = 0;
          while (points[end].length() < closest_point.length()) {
            end = getRandomInt(1, points.length - 1);
          }

          var shortestpath = dgraph.findShortestPath(closest_point_index, end);
          if (shortestpath) {
            var path = shortestpath.map(x => points[x]);
            path.unshift( closest_point );
            path.unshift( start );
            var curve = new THREE.CatmullRomCurve3( path );
            var new_start = curve.getPointAt(0.3);

            var tube_curve = new THREE.CatmullRomCurve3( [
              curve.getPointAt(0),
              curve.getPointAt(0.1),
              curve.getPointAt(0.2),
              curve.getPointAt(0.3)
            ] );

            segments.push({'curve': tube_curve, 'depth': depth});

            growBranch(new_start, depth+1);
          }
        }
      }


      // Branch growth: calculations
      var counter = 0;
      while (counter < 3) {
        var j = getRandomInt(1, points.length - 1);
        var shortestpath = dgraph.findShortestPath(0, j);
        if (shortestpath) {
          var path = shortestpath.map(x => points[x]);
          path.unshift( points[0] );
          var curve = new THREE.CatmullRomCurve3( path );
          var newpoint = curve.getPointAt(0.3);

          var tube_curve = new THREE.CatmullRomCurve3( [
            curve.getPointAt(0),
            curve.getPointAt(0.1),
            curve.getPointAt(0.2),
            curve.getPointAt(0.3)
          ] );

          segments.push({'curve': tube_curve, 'depth': 0});

          growBranch(newpoint, 1);
          counter++;
        }
      }

      //EVENTS
      function onWindowResize() {

        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();

        renderer.setSize( window.innerWidth, window.innerHeight );

      }

      function onDocumentMouseDown( event ) {
        event.preventDefault();

        // calculate mouse position in normalized device coordinates
        // (-1 to +1) for both components

        mouse = new THREE.Vector2(); 

        mouse.x = ( event.clientX / window.innerWidth ) * 2 - 1;
        mouse.y = - ( event.clientY / window.innerHeight ) * 2 + 1;
      }

      function onDocumentKeyDown( event ) {
          var keyCode = event.which;
          if (keyCode == 32) {
              auto_rotate = !auto_rotate;
          }
      };

      document.addEventListener( 'mousedown', onDocumentMouseDown, false );
      document.addEventListener( 'keydown', onDocumentKeyDown, false );
      window.addEventListener( 'resize', onWindowResize, false );


      //FLOWER
      var flowerMaterial = new THREE.MeshPhongMaterial( { color: 0xffffff, vertexColors: true, shininess: 10 } );
      flowerMaterial.side = THREE.DoubleSide;

      function addFlower(pos, scale, direction) {
        var flowerGroup = new THREE.Group();

        var flower_base = new THREE.CurvePath();

        flower_base.add(new THREE.CubicBezierCurve3 (
          new THREE.Vector3(0.05,0,0).multiplyScalar(scale),
          new THREE.Vector3(0.35,0.20,0).multiplyScalar(scale),
          new THREE.Vector3(0.40,1.5,0).multiplyScalar(scale),
          new THREE.Vector3(0.70,2,0).multiplyScalar(scale)
        ));

        flower_base.add(new THREE.CubicBezierCurve3 (
          new THREE.Vector3(0.70,2,0).multiplyScalar(scale),
          new THREE.Vector3(0.80,2.1,0).multiplyScalar(scale),
          new THREE.Vector3(0.80,2.4,0).multiplyScalar(scale),
          new THREE.Vector3(1.6,2.3,0).multiplyScalar(scale)
        ));

        var points_ = flower_base.getPoints( 6 );

        var flowerGeometry = new THREE.LatheBufferGeometry( points_ );

        // Coloring
        var count = flowerGeometry.attributes.position.count;
        flowerGeometry.setAttribute( 'color', new THREE.BufferAttribute( new Float32Array( count * 3 ), 3 ) );

        var color = new THREE.Color();
        var positions = flowerGeometry.attributes.position;
        var colors = flowerGeometry.attributes.color;

        var posXZ;
        var angle;

        var shift = (Math.random() - 0.5) * 0.4;

        for ( var i = 0; i < count; i ++ ) {
            posXZ  = new THREE.Vector2( positions.getX( i ), positions.getZ( i ) );
            angle = posXZ.angle();

            var mult = 1. / scale;

            var radial = Math.max(Math.sin(5 * angle));
            var lightness = 0.5 + 0.5 * (2.4 - positions.getY( i ) * mult) / 2.4;
            lightness *= (0.8 + 0.2 * radial);
            var hue = (( positions.getY( i ) * mult / 5. + 1 ) / 2 + shift) % 1;
            hue += 0.05 * radial;
            var saturation = 0.8;
            saturation += 0.2 * radial;
            color.setHSL( hue, saturation, lightness );
            colors.setXYZ( i, color.r, color.g, color.b );
        }

        flowerGeometry.rotateX(Math.PI/2);

        var flower = new THREE.Mesh( flowerGeometry, flowerMaterial );
        flowerGroup.add( flower );

        // white cylinder
        var geometry = new THREE.CylinderBufferGeometry( 0.05*scale, 0.05*scale, 1.6*scale );
        geometry.translate(0, 0.8*scale, 0);
        geometry.rotateX(Math.PI/2);
        var material = new THREE.MeshPhongMaterial( { color: 0xffffff } );
        var mesh = new THREE.Mesh( geometry, material ) ;
        flowerGroup.add( mesh );

        // white sphere
        var geometry = new THREE.SphereBufferGeometry( 0.15*scale, 24, 24 );
        geometry.translate(0, 0.15*scale, 0);
        geometry.rotateX(Math.PI/2);
        var material = new THREE.MeshPhongMaterial( { color: 0xffffff } );
        var mesh = new THREE.Mesh( geometry, material ) ;
        flowerGroup.add( mesh );

        flowerGroup.lookAt(direction);

        flowerGroup.position.x = pos.x;
        flowerGroup.position.y = pos.y;
        flowerGroup.position.z = pos.z;

        group.add( flowerGroup );
      }


      // LEAF
      var leaf_material = new THREE.MeshPhongMaterial( { color: 0xff0000 } );
      leaf_material.side = THREE.DoubleSide;

      function addLeaf(pos, scale, direction) {
        var x = 0, y = 0;

        var heartShape = new THREE.Shape();

        heartShape.moveTo( x + 5, y + 5 );
        heartShape.bezierCurveTo( x + 5, y + 5, x + 4, y, x, y );
        heartShape.bezierCurveTo( x - 6, y, x - 6, y + 7,x - 6, y + 7 );
        heartShape.bezierCurveTo( x - 6, y + 11, x - 3, y + 15.4, x + 5, y + 19 );
        heartShape.bezierCurveTo( x + 12, y + 15.4, x + 16, y + 11, x + 16, y + 7 );
        heartShape.bezierCurveTo( x + 16, y + 7, x + 16, y, x + 10, y );
        heartShape.bezierCurveTo( x + 7, y, x + 5, y + 5, x + 5, y + 5 );

        var extrudeSettings = {
          steps: 1,
          depth: 1,
          bevelEnabled: false
        };

        var geometry = new THREE.ExtrudeBufferGeometry( heartShape, extrudeSettings );

        geometry.center();
        geometry.scale(scale, 2.0 * scale, scale);

        geometry.computeBoundingBox();
        var size = new THREE.Vector3();
        geometry.boundingBox.getSize(size);
        geometry.translate(0, size.y/2, 0);
        geometry.rotateX(Math.PI/2 + (Math.random() - 0.5) * 2. * Math.PI/3);
        geometry.translate(0, 0, -0.03);
        //geometry.translate(0, 0.5, 0);

        var mesh = new THREE.Mesh( geometry, leaf_material ) ;

        mesh.lookAt(direction);

        mesh.position.x = pos.x;
        mesh.position.y = pos.y;
        mesh.position.z = pos.z;

        group.add( mesh );
      }


      // ANIMATION
      const FRAMES_PER_CURVE = 60;
      var frames_counter = 0;
      var current_depth = -1;
      var current_segments_ids = [];

      var tube_material = new THREE.MeshPhongMaterial( { color: 0x4cbb17 } );

      var animate = function () {
        requestAnimationFrame( animate );

        //Raycasting to grow flowers
        if (mouse) {
          raycaster.setFromCamera( mouse, camera );

          var intersections = raycaster.intersectObjects( group.children );

          var intersection = ( intersections.length ) > 0 ? intersections[ 0 ] : null;

          if (intersection) {
            addFlower( intersection.point, 0.15, intersection.face.normal );
          }

          mouse = false;
        }


        //Branch growth: rendering
        var frame_remainder = frames_counter % FRAMES_PER_CURVE;
        if (frame_remainder == 1) current_depth++;

        var current_fraction = frame_remainder / FRAMES_PER_CURVE;
        if (current_fraction == 0) current_fraction = 1;

        for (var i = 0; i < segments.length; i++) {
          if (segments[i].depth == current_depth) {
            var curve = segments[i].curve;

            var sampling_points = [curve.getPointAt(0)];
            var t = 0.0;
            while(t < current_fraction) {
              t += 1 / FRAMES_PER_CURVE;
              t = Math.min(t, 1);
              sampling_points.push(curve.getPointAt(t));
            }

            var tube_curve = new THREE.CatmullRomCurve3( sampling_points );
            var mult = 5 - current_depth;

            if (current_fraction == 1) {
              var last_point = sampling_points[sampling_points.length-1];
              var tangent = curve.getTangentAt(1).normalize();
              if (current_depth == 4) {
                addLeaf(last_point, 0.005, tangent);
              } else {
                var geometry = new THREE.SphereBufferGeometry(0.01 * mult, 12, 12);
                var pos = last_point.clone();
                geometry.translate(pos.x, pos.y, pos.z);
                var sphere = new THREE.Mesh( geometry, tube_material );
                group.add( sphere );
              }
            }

            var tube_geometry = new THREE.TubeBufferGeometry( tube_curve, 20, 0.01 * mult, 4 * mult, false );
            var tube_mesh = new THREE.Mesh( tube_geometry, tube_material );

            current_segments_ids.push(tube_mesh.uuid);
            group.add( tube_mesh );
          }
        }

        //Camera rotation and controls
        if (auto_rotate) {
          camera_pivot.rotateOnAxis( X_AXIS, 0.01 );
          camera_pivot.rotateOnAxis( Y_AXIS, 0.01 );
        }

        controls.update();

        //Rendering
        renderer.render( scene, camera );

        //Memory management
        if (current_fraction == 1) current_segments_ids = [];

        for (var i = 0; i < current_segments_ids.length; i++) {
          var object = scene.getObjectByProperty( 'uuid', current_segments_ids[i] );
          object.geometry.dispose();
          object.material.dispose();
          scene.remove( object );
        }

        current_segments_ids = [];

        //Frames counter increment
        if (frames_counter < FRAMES_PER_CURVE * 6) frames_counter++;
      };

      animate();
  }
  render() {
    return (
      <div ref={ref => (this.mount = ref)} />
    )
  }
}

export default App;
