
var vertexShader =
    "attribute vec4 a_position;\n" +
    "attribute vec2 a_texcoord;\n" +
    "uniform mat4 u_matrix;\n" +
    "uniform float Dphi;\n" +
    "uniform float Dlambda;\n" +
    "\n" +
    "uniform vec2 canvasSize;\n" +
    "uniform vec2 ratio;\n" +
    "uniform float zoom;\n" +
    "\n" +
    "varying vec2 v_texcoord;\n" +
    "varying vec4 global_texcoord;\n" +
    "\n" +
    "void main() {\n" +
    "float M_PI = 3.14159;\n" +
    "vec4 pos = u_matrix * a_position;\n" +
    "\n" +
    "// X et Y entre -1 et 1\n" +
    "pos.x *= ratio.x;\n" +
    "pos.y *= ratio.y;\n" +
    "\n" +
    "// X entre -pi et pi\n" +
    "pos.x *= M_PI;\n" +
    "// Y entre -pi/2 et pi/2\n" +
    "pos.y *= M_PI * 0.5;\n" +
    "\n" +
    "// rotation X\n" +
    "pos.x += Dphi;\n" +
    "\n" +
    "// on centre X\n" +
    "if (pos.x > M_PI + 0.01) {\n" +
    "pos.x -= 2.0 * M_PI;\n" +
    "}\n" +
    "if (pos.x < -M_PI - 0.01) {\n" +
    "pos.x += 2.0 * M_PI;\n" +
    "}\n" +
    "\n" +
    "// on tourne pour avoir le devant devant\n" +
    "pos.x += M_PI * 0.5;\n" +
    "\n" +
    "float coef = cos(pos.y);\n" +
    "gl_Position.x = cos(pos.x) * coef;\n" +
    "gl_Position.z = sin(pos.x) * coef;\n" +
    "gl_Position.y = sin(pos.y);\n" +
    "\n" +
    "vec3 c1y = vec3(1.0, 0.0, 0.0);\n" +
    "vec3 c2y = vec3(0.0, cos(Dlambda), sin(Dlambda));\n" +
    "vec3 c3y = vec3(0.0, -sin(Dlambda), cos(Dlambda));\n" +
    "mat3 rotY = mat3(c1y, c2y, c3y);\n" +
    "\n" +
    "gl_Position.xyz = rotY * gl_Position.xyz;\n" +
    "\n" +
    "float dem = 1.0 - gl_Position.z;\n" +
    "vec2 xy = vec2(gl_Position.x / dem, gl_Position.y / dem);\n" +
    "gl_Position.xy = xy;\n" +
    "\n" +
    "// Rescale to match canvas resolution\n" +
    "if (canvasSize.x > canvasSize.y) {\n" +
    "gl_Position.x *= canvasSize.y / canvasSize.x;\n" +
    "} else {\n" +
    "gl_Position.y *= canvasSize.x / canvasSize.y;\n" +
    "}\n" +
    "\n" +
    "gl_Position.x *= zoom;\n" +
    "gl_Position.y *= zoom;\n" +
    "\n" +
    "\n" +
    "gl_Position.w = 1.0;\n" +
    "\n" +
    "if (gl_Position.x > 4.0 || gl_Position.x < -4.0) {\n" +
    "gl_Position.z = 1000.0;\n" +
    "}\n" +
    "\n" +
    "global_texcoord = gl_Position;\n" +
    "v_texcoord = a_texcoord;\n" +
    "}\n";

var fragmentShader =
    "precision mediump float;\n" +
    "varying vec2 v_texcoord;\n" +
    "varying vec4 global_texcoord;\n" +
    "uniform sampler2D u_texture;\n" +
    "void main() {\n" +
    "  gl_FragColor = texture2D(u_texture, v_texcoord);\n" +
    "}\n";

function pano(makeUrl) {
    // Get A WebGL context
    /** @type {HTMLCanvasElement} */
    var canvas = document.querySelector("#pano");
    var gl = canvas.getContext("webgl");
    if (!gl) {
        return;
    }

    function creerShader(gl, codeSource, type) {
        // Compile un shader de type soit gl.VERTEX_SHADER, soit gl.FRAGMENT_SHADER
        var shader = gl.createShader(type);
        gl.shaderSource(shader, codeSource);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            var info = gl.getShaderInfoLog(shader);
            throw "Impossible de compiler le programme WebGL.\n\n" + info;
        }
        return shader;
    }

    // setup GLSL program
    var program = webglUtils.createProgramFromSources(gl, [vertexShader, fragmentShader]);

    // look up where the vertex data needs to go.
    var positionLocation = gl.getAttribLocation(program, "a_position");
    var texcoordLocation = gl.getAttribLocation(program, "a_texcoord");

    // lookup uniforms
    var matrixLocation = gl.getUniformLocation(program, "u_matrix");
    var textureLocation = gl.getUniformLocation(program, "u_texture");

    var phiLocation = gl.getUniformLocation(program, "Dphi");
    var lambdaLocation = gl.getUniformLocation(program, "Dlambda");
    var canvasSizeLocation = gl.getUniformLocation(program, "canvasSize");
    var ratioLocation = gl.getUniformLocation(program, "ratio");
    var zoomLocation = gl.getUniformLocation(program, "zoom");

    // Create a buffer.
    var positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    // Put a unit quad in the buffer
    var positions = [
        0, 0,
        0, 1,
        1, 0,
        1, 0,
        0, 1,
        1, 1,
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    // Create a buffer for texture coords
    var texcoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);

    // Put texcoords in the buffer
    var texcoords = [
        0, 0,
        0, 1,
        1, 0,
        1, 0,
        0, 1,
        1, 1,
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texcoords), gl.STATIC_DRAW);

    // creates a texture info { width: w, height: h, texture: tex }
    // The texture will start with 1x1 pixels and be updated
    // when the image has loaded
    function loadImageAndCreateTextureInfo(url) {
        var tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        // Fill the texture with a 1x1 blue pixel.
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                      new Uint8Array([0, 0, 255, 255]));

        // let's assume all images are not a power of 2
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

        var textureInfo = {
            width: 1,   // we don't know the size until it loads
            height: 1,
            texture: tex,
        };
        var img = new Image();
        img.crossOrigin = '';
        img.src = url;
        img.onload = function() {
            textureInfo.width = img.width;
            textureInfo.height = img.height;

            gl.bindTexture(gl.TEXTURE_2D, textureInfo.texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        };

        return textureInfo;
    }

    const _zoom = 5;

    const levelsW = [ 1, 2, 4, 8, 16, 32 ];
    const levelsH = [ 1, 1, 2, 4, 8, 16 ];

    function getRandomInt(max) {
        return Math.floor(Math.random() * max);
    }

    const initX = getRandomInt(levelsW[_zoom]) + 5;

    var textureInfos = [];
    for (var iy = 0; iy < levelsH[_zoom]; iy++) {
        for (var ix = 0; ix < levelsW[_zoom]; ix++) {
            //textureInfos.push(loadImageAndCreateTextureInfo(baseUrl + '&panoid=' + panoId + '&x=' + ix + '&y=' + iy + '&zoom=' + _zoom));
            textureInfos.push(loadImageAndCreateTextureInfo(makeUrl(ix, iy, _zoom)));
        }
    }

    var tileSize;
    function computeTileSize() {
        const rh = document.body.clientHeight / levelsH[_zoom];
        const rw = document.body.clientWidth / levelsW[_zoom];
        if (rw < rh) {
            tileSize = rw;
        } else {
            tileSize = rh;
        }
    }
    computeTileSize();

    var drawInfos = [];

    function makeDrawInfo() {
        drawInfos = [];
        for (var iy = 0; iy < levelsH[_zoom]; iy++) {
            for (var ix = 0; ix < levelsW[_zoom]; ix++) {
                var drawInfo = {
                    x: (ix+initX) % levelsW[_zoom],
                    y: iy,
                    textureInfo: textureInfos[ix + iy*levelsW[_zoom]],
                };
                drawInfos.push(drawInfo);
            }
        }
    }

    makeDrawInfo();

    function draw() {
        webglUtils.resizeCanvasToDisplaySize(gl.canvas);

        // Tell WebGL how to convert from clip space to pixels
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

        gl.clear(gl.COLOR_BUFFER_BIT);

        const offX = (gl.canvas.width - tileSize * levelsW[_zoom])/2;
        const offY = (gl.canvas.height - tileSize * levelsH[_zoom])/2;

        drawInfos.forEach(function(drawInfo) {
            drawImage(
                drawInfo.textureInfo.texture,
                tileSize, tileSize,
                drawInfo.x*tileSize + offX,
                drawInfo.y*tileSize + offY);
        });
    }

    //var wheel = 1.0;
    var realZoom = 3.0;
    var rotX = 0;
    var rotY = 0;
    var mouseDownRotX = 0;
    var mouseDownRotY = 0;
    var mouseDownX = 0;
    var mouseDownY = 0;
    var isMouseDown = false;

    document.onwheel = (event) => {
        realZoom += event.wheelDelta / 100;
        if (realZoom < 2.0) realZoom = 2.0;
        if (realZoom > 40.0) realZoom = 40.0;
        //realZoom = wheel * 3.0;
    }
    document.onmousemove = (event) => {
        event = event || window.event; // IE-ism
        if (isMouseDown) {
            rotX = mouseDownRotX + (event.pageX - mouseDownX) * 2 * 3.14 / (gl.canvas.width * realZoom);
            rotY = mouseDownRotY - (event.pageY - mouseDownY) * 2 * 3.14 / (gl.canvas.height * realZoom);
        }
    }
    document.onmousedown = (event) => {
        mouseDownX = event.pageX;
        mouseDownY = event.pageY;
        mouseDownRotX = rotX;
        mouseDownRotY = rotY;
        isMouseDown = true;
    }
    document.onmouseup = (event) => {
        isMouseDown = false;
    }

    function render(time) {
        computeTileSize();
        const overX = tileSize*levelsW[_zoom] - gl.canvas.width;
        const overY = tileSize*levelsH[_zoom] - gl.canvas.height;
        draw();

        requestAnimationFrame(render);
    }
    requestAnimationFrame(render);


    // Unlike images, textures do not have a width and height associated
    // with them so we'll pass in the width and height of the texture
    function drawImage(tex, texWidth, texHeight, dstX, dstY) {
        gl.bindTexture(gl.TEXTURE_2D, tex);

        // Tell WebGL to use our shader program pair
        gl.useProgram(program);

        // Setup the attributes to pull data from our buffers
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);
        gl.enableVertexAttribArray(texcoordLocation);
        gl.vertexAttribPointer(texcoordLocation, 2, gl.FLOAT, false, 0, 0);

        // this matrix will convert from pixels to clip space
        var matrix = m4.orthographic(0, gl.canvas.width, gl.canvas.height, 0, -1, 1);

        // this matrix will translate our quad to dstX, dstY
        matrix = m4.translate(matrix, dstX, dstY, 0);

        // this matrix will scale our 1 unit quad
        // from 1 unit to texWidth, texHeight units
        matrix = m4.scale(matrix, texWidth, texHeight, 1);

        // Set the matrix.
        gl.uniformMatrix4fv(matrixLocation, false, matrix);

        // Tell the shader to get the texture from texture unit 0
        gl.uniform1i(textureLocation, 0);

        gl.uniform1f(phiLocation, rotX);
        gl.uniform1f(lambdaLocation, rotY);

        gl.uniform2f(canvasSizeLocation, gl.canvas.width, gl.canvas.height);
        gl.uniform2f(ratioLocation, gl.canvas.width / (levelsW[_zoom]*tileSize), gl.canvas.height / (levelsH[_zoom]*tileSize));

        gl.uniform1f(zoomLocation, realZoom);

        // draw the quad (2 triangles, 6 vertices)
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
}
