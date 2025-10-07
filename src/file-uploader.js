/*
        PITCHPRINT File Uploader.
*/

class PitchPrintFileUploader {
    constructor (_vars = {}) {
        if (!_vars.cdnBase) _vars.cdnBase = 'https://pitchprint.io/rsc/';
        this._vars = {
            uploadArr: [],
            uploadStack: [],
            idx: 0,
            params: _vars
        };
        switch (_vars.client) {
            case 'oc':
                _vars.thumbsSrc = 'image/data/files/';
            break;
            case 'ps':
            case 'sp':
                _vars.thumbsSrc = `${_vars.cdnBase}images/files/`;
            break;
            default:
                _vars.thumbsSrc = 'images/files/';
            break;
        }
    }
    show() {
        if (!this._ui) {
            // Create DOM element instead of using jQuery
            const container = document.createElement('section');
            container.style.width = '100%';
            container.style.height = '100%';
            container.style.display = 'flex';
            container.style.justifyContent = 'center';
            container.style.alignItems = 'center';
            
            container.innerHTML = `
                <div id="ppc-upload-panel-div" style="width:90%; max-width:500px; height:90%; max-height: 500px; display: flex; background-color:white;justify-content:center; flex-direction:column;">
                    <div style="width: 100%; height: 50px; background-color: black; text-align:center; color: #ccc; padding: 15px 0; text-transform:uppercase; cursor:pointer; position:relative">
                        ${this._vars.params.lang ? this._vars.params.lang['add_files'] : 'Add Files'}
                        <input id="ppc-upload-input" style="cursor: pointer;position: absolute;width:100%;height:430px;left:0;top:0;opacity:0" type="file" name="files[]" multiple>
                    </div>
                    <div id="ppc-upload-stack" style="display: flex; flex-wrap: wrap; overflow-y: auto; padding: 10px;width: 100%; height: 100%; background-image:url(${this._vars.params.cdnBase}images/uploadicon.png); background-repeat:no-repeat; background-position:center"></div>
                    <div style="width: 100%; height: 60px; padding: 10px 0">
                        <input type="button" id="ppc-stop-upload-btn" value="✗ ${this._vars.params.lang ? this._vars.params.lang['button_label_cancel']:'Cancel'}"> &nbsp;&nbsp; 
                        <input type="button" disabled="disabled" id="ppc-start-upload-btn" value="✓ ${this._vars.params.lang ? this._vars.params.lang['submit_tip'] : 'Submit'}">
                    </div>
                </div>
                <div id="ppc-upload-prgs-parent" style="box-sizing: content-box; webkit-box-sizing: content-box; width: 80px; margin: 0 auto; margin-top: 120px; position: relative;">
                    <div id="ppc-upload-prgs" style="float: left; width: 80px; height: 80px;"></div>
                </div>
            `;
            
            this._ui = container;
            this._initUploader();
        }
        this._showModal(this._ui);
        this._panelDiv.style.display = 'flex';
        this._ui.style.display = 'block';
        this._uploadProgress.style.display = 'none';
    }
    _initUploader() {
        document.body.appendChild(this._ui);
        
        this._btnStartUpload = document.getElementById('ppc-start-upload-btn');
        this._btnStartUpload.onclick = this._plsUpload.bind(this);
        this._btnStopUpload = document.getElementById('ppc-stop-upload-btn');
        this._btnStopUpload.onclick = this._hideUpload.bind(this);
        this._uploadStack = document.getElementById('ppc-upload-stack');
        this._uploadProgress = document.getElementById('ppc-upload-prgs-parent');
        this._uploadProgress.style.display = 'none';
        this._panelDiv = document.getElementById('ppc-upload-panel-div');
        
        // Create remove button template
        const createRemoveBtn = (data) => {
            const img = document.createElement('img');
            img.src = `${this._vars.params.cdnBase}images/cross.png`;
            img.style.cssText = 'cursor:pointer; left: 10px;top: 10px;position: absolute;width: 16px;height: 16px;';
            img.dataset.idx = data.idx;
            
            img.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.idx, 10);
                e.target.parentElement.remove();
                if (data.abort) data.abort();
                this._vars.uploadArr[idx] = null;
                this._checkUploads();
            });
            
            return img;
        };
        
        // Initialize file uploader with native file input
        const fileInput = document.getElementById('ppc-upload-input');
        fileInput.addEventListener('change', (e) => {
            const files = e.target.files;
            if (!files.length) return;
            
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const err = this._checkFileAllowed(file.name);
                if (err) {
                    alert(err);
                    continue;
                }
                
                // Create context elements for this file
                const context = document.createElement('div');
                context.style.cssText = 'width: 135px; height:165px; background-color: #ccc;margin: 8px;border-radius: 3px; position:relative; overflow:hidden; padding: 5px;font-size: 12px;';
                context.innerHTML = `<div style="font-size:10px; overflow:hidden">${file.name}</div>`;
                this._uploadStack.prepend(context);
                
                // Process file preview
                const data = {
                    files: [file],
                    context: context,
                    idx: this._vars.idx
                };
                
                // Create file preview
                const reader = new FileReader();
                reader.onload = (e) => {
                    // For image files
                    if (file.type.match('image.*')) {
                        const img = document.createElement('img');
                        img.style.height = '125px';
                        img.src = e.target.result;
                        context.prepend(img);
                        file.preview = {
                            toDataURL: () => e.target.result
                        };
                    } else {
                        // For non-image files
                        const img = document.createElement('img');
                        img.style.height = '125px';
                        img.src = `${this._vars.params.cdnBase}images/files/${file.name.split('.').pop().toLowerCase()}.png`;
                        context.prepend(img);
                    }
                    
                    // Add remove button
                    context.appendChild(createRemoveBtn(data));
                    
                    // Add to upload array
                    this._vars.uploadArr.push(data);
                    this._vars.idx++;
                    this._checkUploads();
                };
                
                if (file.type.match('image.*')) {
                    reader.readAsDataURL(file);
                } else {
                    reader.readAsArrayBuffer(file.slice(0, 1)); // Just read a bit to trigger onload
                }
            }
        });
        
        // Setup drag and drop
        this._uploadStack.addEventListener('dragenter', (e) => {
            e.preventDefault();
            e.target.style.backgroundColor = '#BFBFBF';
        });
        
        this._uploadStack.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.target.style.backgroundColor = 'transparent';
        });
        
        this._uploadStack.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        
        this._uploadStack.addEventListener('drop', (e) => {
            e.preventDefault();
            e.target.style.backgroundColor = 'transparent';
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                fileInput.files = files;
                // Trigger change event
                const event = new Event('change');
                fileInput.dispatchEvent(event);
            }
        });
        
        // Remove from DOM and save reference
        this._ui.remove();
    }
    
    _checkFileAllowed(_fname) {
        if (!window.ppclient._config.uploadAccepts) return false;
        let iType = _fname.split('.').pop().trim().toLowerCase();
        
        if (window.ppclient._config.uploadAccepts.split(',').map(_ => _.toLowerCase().trim()).indexOf(iType) === -1) 
            return `Only files of type: ${window.ppclient._config.uploadAccepts} are allowed`;
    }
    
    _hideUpload() {
        if (this._ui.parentNode) {
            this._ui.remove();
        }
        this._unblockUI();
    }
    
    _plsUpload(_e) {
        if (_e) this._showUploadProgress();
        if (this._checkUploads()) {
            let _l = this._vars.uploadArr.length, _poped;
            for (let _i = 0; _i < _l; _i++) {
                _poped = this._vars.uploadArr.pop();
                if (_poped) {
                    // Handle file upload
                    this._uploadFile(_poped);
                    return;
                }
            }
        }
    }
    
    // New method to handle file upload
    _uploadFile(data) {
        const file = data.files[0];
        const formData = new FormData();
        formData.append('file', file);
        formData.append('convert', 'true');
        
        let uploadUrl = this._vars.params.uploadUrl;
        
        if (this._vars.params.client === 'sp' && !file.pprint) {
            window.ppclient._comm(`${this._vars.params.apiBase}upload`, { 
                ext: file.name.split('.').pop().toLowerCase(), 
                contentType: file.type, 
                isUpload: true 
            })
            .then(_val => {
                uploadUrl = _val.url;
                
                // Add S3 fields
                for (const key in _val.fields) {
                    formData.append(key, _val.fields[key]);
                }
                
                formData.append('x-amz-meta-pprint', "{ code: 'Hello love' }");
                formData.append('Content-Type', file.type);
                file.pprint = _val.fields.Key;
                
                this._processUpload(data, uploadUrl, formData);
            })
            .catch(_err => console.log(_err));
        } else {
            this._processUpload(data, uploadUrl, formData);
        }
    }
    
    _processUpload(data, url, formData) {
        const xhr = new XMLHttpRequest();
        let loaded = 0;
        let total = 0;
        
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                loaded = e.loaded;
                total = e.total;
                if (this._uploadProgressAnim) {
                    this._uploadProgressAnim.circleProgress('value', loaded / total);
                }
            }
        });
        
        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                let result;
                try {
                    result = JSON.parse(xhr.responseText);
                } catch(e) {
                    // For S3 uploads there might not be JSON response
                    result = { files: [{ url: data.files[0].pprint || data.files[0].name }] };
                }
                
                // Handle successful upload
                if (this._vars.params.client === 'sp') {
                    this._vars.uploadStack.push({ 
                        url: data.files[0].pprint || formData.get('Key'),
                        thumbnailUrl: data.files[0].preview ? data.files[0].preview.toDataURL() : 
                            `${this._vars.params.thumbsSrc}${data.files[0].name.split('.').pop().toLowerCase()}.png`
                    });
                } else {
                    if (result.files) {
                        result.files.forEach(file => {
                            if (file.url) {
                                this._vars.uploadStack.push(file);
                            } else if (file.error) {
                                this._alert(this._vars.params.lang['upload_error']);
                                this._unblockUI();
                            }
                        });
                    }
                }
                
                if (this._vars.uploadArr.length > 0) {
                    this._plsUpload();
                } else {
                    this._unblockUI();
                    this._finishedUploading();
                }
            } else {
                this._alert(this._vars.params.lang['upload_error']);
                this._unblockUI();
            }
        });
        
        xhr.addEventListener('error', () => {
            this._alert(this._vars.params.lang['upload_error']);
            this._unblockUI();
        });
        
        xhr.open('POST', url, true);
        xhr.send(formData);
        
        // Store abort function
        data.abort = () => xhr.abort();
    }
    
    _showUploadProgress() {
        if (!this._uploadProgressAnim) {
            // Simple placeholder for circle progress animation
            this._uploadProgressAnim = {
                circleProgress: function(action, value) {
                    const progressElement = document.getElementById('ppc-upload-prgs');
                    if (action === 'value') {
                        // Update progress visualization (simplified version)
                        progressElement.style.background = `conic-gradient(#EEEEEE ${value * 360}deg, transparent 0deg)`;
                        progressElement.style.borderRadius = '50%';
                    }
                }
            };
        }
        
        this._uploadProgress.style.display = 'block';
        this._panelDiv.style.display = 'none';
    }
    
    _finishedUploading() {
        let _prevs = [], _imgs = [], _projectId, _cValue;
        if (window.ppclient) window.ppclient._trigger('before-finished-uploading', this._vars.uploadStack);
        
        this._vars.uploadStack.forEach((_itm) => {
            if (!_itm.thumbnailUrl) {
                if (_itm.vectorThumbs) {
                    _prevs = _prevs.concat(_itm.vectorThumbs);
                } else {
                    _itm.thumbnailUrl = `${this._vars.params.cdnBase}images/files/${_itm.url.split('.').pop().toLowerCase()}.png`;
                }
            }
            _prevs.push(_itm.thumbnailUrl);
            _imgs.push(_itm.url);
        });
        
        this._vars.params.mode = 'upload';
        if (this._vars.params.client === 'sp') _projectId = `U-${this._vars.params.env.uniqueId}`;
        
        _cValue = encodeURIComponent(JSON.stringify({ 
            projectId: _projectId,
            files: _imgs,
            previews: _prevs,
            meta: {},
            userId: this._vars.params.userId,
            product: this._vars.params.product,
            type: 'u' 
        }));
        
        if (this._vars.params.client === 'sp' && document.getElementById('_pitchprint')) {
            document.getElementById('_pitchprint').value = _projectId;
        } else {
            // Query selector instead of jQuery
            const cvalElements = document.querySelectorAll(this._vars.params.selectors.qryCval);
            if (cvalElements.length) {
                cvalElements.forEach(el => el.value = _cValue);
            }
        }
        
        let _oc = document.querySelector(`#_w2p_set_option,#web2print_option_value,#${this._vars.params.ocInputOption}`);
        if (_oc) _oc.value = _cValue;
            
        window.ppclient.saveSess({ 
            values: _cValue, 
            isUpload: true, 
            projectId: _projectId, 
            productId: this._vars.params.product.id 
        });
        
        window.ppclient.updatePreviews(_prevs, '', false);
        window.ppclient.setBtnPref();
    }
    
    _alert(_val) {
        console.log(_val);
    }
    
    _checkUploads() {
        for (let _i = 0; _i < this._vars.uploadArr.length; _i++) {
            if (this._vars.uploadArr[_i] !== null) {
                this._btnStartUpload.disabled = false;
                return true;
            }
        }
        this._btnStartUpload.disabled = true;
        return false;
    }
    
    _showModal(_msg) {
        // Create overlay
        const overlay = document.createElement('div');
        overlay.id = 'pp-modal-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999999;';
        
        // Add modal to body
        document.body.appendChild(overlay);
        document.body.appendChild(_msg);
        
        _msg.style.position = 'fixed';
        _msg.style.zIndex = '99999999';
        _msg.style.top = '0';
        _msg.style.left = '0';
        _msg.style.right = '0';
        _msg.style.bottom = '0';
        _msg.style.margin = '0';
        _msg.style.padding = '0';
        _msg.style.width = '100%';
        _msg.style.background = 'rgba(0,0,0,0)';
        _msg.style.border = 'none';
        _msg.style.textAlign = 'center';
    }
    
    _unblockUI() {
        const overlay = document.getElementById('pp-modal-overlay');
        if (overlay) overlay.remove();
        
        // If UI is in the document, remove it
        if (this._ui.parentNode === document.body) {
            document.body.removeChild(this._ui);
        }
    }
}