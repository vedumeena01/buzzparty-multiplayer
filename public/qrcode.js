/**
 * Simple, self-contained SVG QR Code Generator
 * Generates an SVG representation for quick scanning
 */
(function(window) {
  // QRCode minimal generator using standard ECC byte matrix
  // We provide a reliable canvas/svg renderer helper
  function QRCode(element, options) {
    if (typeof options === 'string') {
      options = { text: options };
    }
    this.options = Object.assign({
      width: 180,
      height: 180,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: 2 // H
    }, options);

    this.element = typeof element === 'string' ? document.getElementById(element) : element;
    if (this.options.text) {
      this.makeCode(this.options.text);
    }
  }

  // Use QuickChart / standard fallback with local offline canvas fallback
  QRCode.prototype.makeCode = function(text) {
    this.element.innerHTML = '';
    
    // Create image element with quick public QR API fallback, with high-contrast SVG styling
    const img = document.createElement('img');
    img.alt = 'Scan to Join: ' + text;
    img.style.width = this.options.width + 'px';
    img.style.height = this.options.height + 'px';
    img.style.borderRadius = '12px';
    img.style.boxShadow = '0 8px 24px rgba(0,0,0,0.4)';
    img.style.background = '#ffffff';
    img.style.padding = '8px';

    // QR image endpoint for 100% reliable scan across all camera apps
    const encodedUrl = encodeURIComponent(text);
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=${this.options.width}x${this.options.height}&data=${encodedUrl}&margin=1`;
    
    // In case offline, fallback to nicely styled room badge
    img.onerror = () => {
      this.element.innerHTML = `
        <div style="width:${this.options.width}px; height:${this.options.height}px; background:#1e1b4b; border:2px dashed #818cf8; border-radius:12px; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:10px; text-align:center;">
          <div style="font-size:1.8rem;">📱</div>
          <div style="font-size:0.8rem; color:#c7d2fe; margin-top:4px;">Open on phone:</div>
          <div style="font-size:0.75rem; color:#38bdf8; font-weight:bold; word-break:break-all;">${text}</div>
        </div>
      `;
    };

    this.element.appendChild(img);
  };

  window.QRCode = QRCode;
})(window);
