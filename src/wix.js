/*
        PitchPrint Wix Integration.
*/

(function (global) {

    if (window.ppWixSetup) return;

    var userData, userId;

    const
        PREVIEWPATH = 'https://s3-eu-west-1.amazonaws.com/pitchprint.io/previews/',
        APP_CLIENT_ID = 'b900693a-6304-469d-b100-61db78a331aa',
        storeProjects = {},
        scriptLoadPromises = {},
        delegatedCartHandlers = {
            removeLineItem: false,
            decrementLineItem: false
        },

        loadScript = (src, onLoadFnc) => {
            const existingScript = document.querySelector(`[src="${src}"]`);
            let loadPromise = scriptLoadPromises[src];

            if (existingScript && (existingScript.dataset.ppScriptLoaded === 'true' || existingScript.readyState === 'loaded' || existingScript.readyState === 'complete')) {
                loadPromise = loadPromise || Promise.resolve();
            } else if (!loadPromise && existingScript) {
                loadPromise = new Promise((resolve, reject) => {
                    existingScript.addEventListener('load', () => {
                        existingScript.dataset.ppScriptLoaded = 'true';
                        resolve();
                    }, { once: true });

                    existingScript.addEventListener('error', () => {
                        delete scriptLoadPromises[src];
                        reject(new Error(`Failed to load script: ${src}`));
                    }, { once: true });
                });
            } else if (!loadPromise) {
                let script = document.createElement('script');

                loadPromise = new Promise((resolve, reject) => {
                    script.onload = () => {
                        script.dataset.ppScriptLoaded = 'true';
                        resolve();
                    };

                    script.onerror = () => {
                        delete scriptLoadPromises[src];
                        reject(new Error(`Failed to load script: ${src}`));
                    };
                });

                script.src = src;
                document.querySelector('head').appendChild(script);
            }

            scriptLoadPromises[src] = loadPromise;
            loadPromise.catch(console.log);

            if (typeof onLoadFnc === 'function') loadPromise.then(() => onLoadFnc());

            return loadPromise;
        },

        parseJson = (str, fallback = null) => {
            try {
                return JSON.parse(str);
            } catch (e) { return fallback }
        },

        readStorageObject = key => {
            if (typeof window === 'undefined') return {};
            return parseJson(window.localStorage.getItem(key), {});
        },

        readStorageArray = key => {
            if (typeof window === 'undefined') return [];
            return parseJson(window.localStorage.getItem(key), []);
        },

        writeStorage = (key, value) => {
            if (typeof window === 'undefined') return;
            window.localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        },

        decodeValues = param => {
            let value = param;

            if (typeof param === 'string') {
                try {
                    value = parseJson(decodeURIComponent(param), {});
                } catch (e) {
                    value = {};
                }
            }

            if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
            if (value.projectId) value.preview = `${PREVIEWPATH}${value.projectId}_1.jpg`;
            return value;
        },

        start = async param => {
            param = param || {};

            // Wait for React to fully hydrate before manipulating DOM
            if (typeof window !== 'undefined' && !window.__reactHydrated) {
                await new Promise(resolve => {
                    const checkHydration = setInterval(() => {
                        if (document.readyState === 'complete') {
                            clearInterval(checkHydration);
                            setTimeout(resolve, 100); // Small delay for React hydration
                        }
                    }, 50);
                });
                window.__reactHydrated = true;
            }

            if (window.location.href.includes('/account/my-orders') || param.pageTypeIdentifier === "member_page")
                return startClientAccount(param);

            let productId = param.productId,
                values = storeProjects[productId],
                apiKey = document.getElementById('pitchprint-script')?.src?.split('=')[1],
                store = readStorageObject('pprint-wx');


            if (userData === undefined) {
                await comm(`https://${window.location.hostname}/_api/apps/current-member/${APP_CLIENT_ID}`, '', 'GET', 'json', true)
                    .then(data => {
                        userId = String(data?.member?.id || 'guest');
                        userData = data?.member || '';
                    })
                    .catch(e => console.log(e));
            }
            let currValues = store[productId] || {};
            if (typeof currValues === 'string') currValues = decodeValues(currValues);

            if (!values) {
                values = await fetch('https://api.pitchprint.com/admin/wix-product-tag', {
                    method: 'post',
                    headers: { 'Accept': 'application/json, text/plain, */*', 'Content-Type': 'application/json' },
                    body: JSON.stringify({ apiKey: apiKey, productId: productId })
                })
                    .then(response => {
                        if (!response.ok) throw new Error(`wix-product-tag request failed: ${response.status}`);
                        return response.json();
                    })
                    .catch(error => {
                        console.log(error);
                        return {};
                    });
            }
            if (values?.designId) storeProjects[productId] = values;
            if (!values?.designId && !currValues.projectId) return;

            let elmParent = document.querySelector('[data-hook="product-prices-wrapper"]');
            if (!elmParent) {
                let cartElem = document.querySelector('[data-hook="add-to-cart"], [aria-label="Add to Cart"], [aria-label="Ajouter au panier"], [aria-label="Legg til i handlekurv"], [aria-label="In den Warenkorb"], .add-to-cart button');
                elmParent = cartElem?.parentNode;
            }
            if (!elmParent) return console.log('Weird, PitchPrint needs the pricing element to hook div to');

            const btnSec = document.getElementById('pp_main_btn_sec');
            if (btnSec) btnSec.remove();

            // Use requestAnimationFrame to avoid hydration conflicts
            requestAnimationFrame(() => {
                elmParent.insertAdjacentHTML('beforeend', '<div id="pp_main_btn_sec"><img src="https://pitchprint.io/rsc/images/loaders/spinner_new.svg"style="width:24px"></div>');

                if (window.ppclient) {
                    window.ppclient.destroy();
                    window.ppclient = null;
                }

                window.ppclient = new PPrint({
                    client: 'wx',
                    apiKey: apiKey,
                    createButtons: true,
                    userId,
                    userData,
                    enableUpload: values?.upload || false,
                    langCode: (window.wixEmbedsAPI?.getLanguage()) || 'en',
                    designId: currValues?.designId || values?.designId,
                    projectId: currValues?.projectId || '',
                    previews: currValues?.previews || currValues?.numPages,
                    mode: currValues?.type === 'u' ? 'upload' : (currValues?.projectId ? 'edit' : 'new'),
                    displayMode: values?.displayMode,

                    product: values?.product || {
                        id: param.productId,
                        title: param.name,
                        name: param.name,
                        url: window.location.href
                    }
                });

                window.ppclient.on('set-page-count', event => {
                    if (event?.data?.count && window.PPCLIENT?.quantitySelector) {
                        const quantity = document.querySelector(window.PPCLIENT.quantitySelector);
                        if (quantity) {
                            quantity.value = event.data.count;
                            quantity.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }
                });

                window.ppclient.on('session-saved', event => {
                    let store = readStorageObject('pprint-wx');
                    var projectId = event.data.projectId || event.data.values?.projectId || event.data.values?.id || event.data.values?.designId || '';
                    console.log('Session saved', event.data);
                    if (event.data.clear) {
                        if (store) delete store?.[productId];
                    } else {
                        const savedValues = parseJson(decodeURIComponent(event.data.values), null);
                        if (store && savedValues) store[productId] = savedValues;
                        if (savedValues && projectId.substr(0, 2) === 'U-') {
                            delete store?.[productId]?.previews;
                            _zipFiles(event.data.values);
                        }
                    }

                    writeStorage('pprint-wx-c', store);
                    writeStorage('pprint-wx', store);

                    if (event.data.clear)
                        window.location.reload();
                });
            });
        },

        clearDesign = (productId) => {
            if (!window.ppclient) return;

            var projects = readStorageObject('pp-projects'),
                store = readStorageObject('pprint-wx');

            if (store) {
                let storeValues = store[productId] || {};
                var values = projects?.[productId] || [];
                if (typeof storeValues === 'string') storeValues = decodeValues(storeValues);
                values.push(storeValues)
                projects[productId] = values
                writeStorage('pp-projects', projects)
            }

            setTimeout(() => {
                delete store[productId];
                writeStorage('pprint-wx', store);
                window.location.reload();
            }, 500);
        },

        clearFromCart = (productId) => {
            var projects = readStorageObject('pp-projects'),
                addedToCart = readStorageArray('addedToCart');

            setTimeout(() => {
                addedToCart = addedToCart.filter(item => item.id !== productId);
                delete projects[productId];
                writeStorage('addedToCart', addedToCart)
                writeStorage('pp-projects', projects);
            }, 500);
        },

        startClientAccount = async param => {

            var userData, userId;

            await comm(`https://${window.location.hostname}/_api/apps/current-member/${APP_CLIENT_ID}`, '', 'GET', 'json', true)
                .then(data => {
                    userId = data?.member?.id;
                    userData = data?.member;
                }).catch(e => console.log(e));

            window.ppclient = new PPrint({
                userId: String(userId || 'guest'),
                userData: userData || '',
                langCode: document.querySelector('html').getAttribute('lang') || 'en',
                mode: 'edit',
                apiKey: getApiKey(),
                client: 'wx',
                afterValidation: '_fetchProjects'
            });
            window.ppclient.on('app-validated', initSaveForLater);
        },

        storeOrders = param => {

            if (!param?.contents) return;
            let storeData = readStorageObject('pp-projects'), doSave;

            param.contents.forEach(item => {
                if (storeData[item?.id]) {
                    let currValue = storeData[item.id];
                    let projArr = []
                    if (currValue) {
                        for (var i = 0; i < currValue.length; i++) {
                            projArr.push(currValue[i].projectId)
                            item.projectId = projArr;
                        }
                        doSave = true;
                    }
                }
            });

            const token = window.localStorage.getItem('pptoken');

            if (doSave && token) {
                fetch('https://api.pitchprint.com/app/save-order', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: token, cart: param }),
                })
                    .then((response) => {
                        if (!response.ok) throw new Error(`save-order request failed: ${response.status}`);
                        return response.json();
                    })
                    .then(() => window.localStorage.removeItem('pp-projects'))
                    .catch(console.error);
            }
        },

        setCartImages = () => {
            var element = document.querySelectorAll('[data-hook="product-thumbnail-media"] img, [data-hook="product-thumbnail-media"], [data-hook="product-thumbnail-wrapper"] img'),
                cartItems = readStorageArray('addedToCart');

            // remove non image elements from element
            element = Array.from(element).filter(el => el.tagName === 'IMG');

            console.log('Filtered elements', element);
            if (element && cartItems) {
                cartItems.forEach((item, idx) => {
                    if (item.projectId?.length > 0) {
                        var lastProjectId = item.projectId[item.projectId.length - 1];
                        if (element[idx]) {
                            console.log(element, item)
                            setTimeout(() => {
                                element[idx].src = `${PREVIEWPATH}${lastProjectId}_1.jpg?`;
                                element[idx].srcset = `${PREVIEWPATH}${lastProjectId}_1.jpg?`;
                            }, 1000);
                        }
                    }
                });
            }
        },

        removeLineItem = () => {
            if (delegatedCartHandlers.removeLineItem) return;
            delegatedCartHandlers.removeLineItem = true;

            document.body.addEventListener('click', event => {
                const removeButton = event.target.closest('[data-hook="CartItemDataHook.remove"]');
                if (!removeButton) return;

                const removeButtons = Array.from(document.querySelectorAll('[data-hook="CartItemDataHook.remove"]'));
                const index = removeButtons.indexOf(removeButton);
                if (index < 0) return;

                const cartItems = readStorageArray('addedToCart');
                cartItems.splice(index, 1);
                writeStorage('addedToCart', cartItems);
                setTimeout(setCartImages, 500);
            });
        },

        removeProjectLineItem = () => {
            if (delegatedCartHandlers.decrementLineItem) return;
            delegatedCartHandlers.decrementLineItem = true;

            document.body.addEventListener('click', event => {
                const decrementButton = event.target.closest('[name="decrement"]');
                if (!decrementButton) return;

                const decrementButtons = Array.from(document.querySelectorAll('[name="decrement"]'));
                const quantities = document.querySelectorAll('[data-hook="CartItemDataHook.quantity"] input');
                const index = decrementButtons.indexOf(decrementButton);
                if (index < 0 || !quantities[index]) return;

                const cartItems = readStorageArray('addedToCart');
                if (cartItems[index]?.projectId && cartItems[index].projectId.length > 1 && quantities[index].value > 1) {
                    cartItems[index].projectId.splice(-1);
                    console.log(cartItems)
                    writeStorage('addedToCart', cartItems);
                    setTimeout(setCartImages, 500);
                }
            });
        },

        _zipFiles = (_val) => {
            _val = decodeValues(_val);
            if (!_val?.projectId || !_val?.files) return;

            console.log('Zipping files', _val);
            // USE PITCHPRINT.IO API TO ZIP FILES
            window.ppclient.comm('https://api.pitchprint.io/client/zip-uploads', { files: _val.files, id: _val.projectId })
                .catch(console.log);
        },

        initSaveForLater = () => {
            // Wait for DOM to be stable before injecting
            const injectDiv = () => {
                const wrapper = document.querySelector('._2JOHk,#TPAMultiSection_knia8al9,#TPAMultiSection_kw4yte5f,[id^="TPAMultiSection_"],#comp-lkpu4z2h');
                console.log('Injecting Save for Later div', wrapper);
                if (wrapper && !document.getElementById('pp_mydesigns_div')) {
                    requestAnimationFrame(() => {
                        wrapper.insertAdjacentHTML('afterbegin', '<div id="pp_mydesigns_div"></div>');
                    });
                }

                if (!wrapper && window.PPCLIENT?.customAccountDivSel && !document.getElementById('pp_mydesigns_div')) {
                    const customDiv = document.querySelector(window.PPCLIENT.customAccountDivSel);
                    if (customDiv) {
                        requestAnimationFrame(() => {
                            customDiv.insertAdjacentHTML('afterbegin', '<div id="pp_mydesigns_div"></div>');
                        });
                    }
                }
            };

            // Delay injection to avoid hydration conflicts
            setTimeout(injectDiv, 300);

            const run = () => {
                const table = document.getElementById('pp-recent-table');
                if (table) {
                    clearInterval(checkTable);
                    table.addEventListener('click', evt => {
                        if (evt.target?.dataset?.fnc === 'clone') {
                            duplicateProject(evt.target.dataset.idx, evt.target.dataset.resume === 'true');
                        }
                    });
                }
            }
            const checkTable = setInterval(run, 1000);
            run();
        },

        duplicateProject = (value, resume) => {

            let project = window.ppclient.vars.projects[parseInt(value)],
                storeData = readStorageObject('pprint-wx'),
                data = {
                    projectId: project.id,
                    numPages: project.pages || project.pageLength || 1,
                    meta: {},
                    userId: project.userId,
                    product: project.product,
                    designId: project.designId,
                    type: 'p'
                };

            storeData[project.product.id] = data;
            writeStorage('pprint-wx', storeData);
        },

        comm = (_url, _data, _method, _dType = 'json', _cred = true) => {
            return new Promise((_res, _rej) => {
                const method = (_method || 'GET').toUpperCase();
                let _cType = null;
                let _formData = null;

                if (_data && method === 'GET') {
                    const params = [];
                    for (let _key in _data) {
                        if (typeof _data[_key] !== 'undefined' && _data[_key] !== null) {
                            params.push(encodeURIComponent(_key) + '=' + encodeURIComponent(_data[_key]));
                        }
                    }
                    const query = params.join('&').replace(/%20/g, '+');
                    if (query) _url += `?${query}`;
                } else if (_data && method !== 'GET') {
                    _cType = 'application/json';
                    _formData = JSON.stringify(_data);
                }

                const _xhr = new XMLHttpRequest();
                _xhr.open(method, _url, true);
                _xhr.onload = () => {
                    if (_xhr.status < 200 || _xhr.status >= 300) {
                        _rej(_xhr.statusText || `HTTP ${_xhr.status}`);
                        return;
                    }

                    if (_dType === 'json') {
                        const response = parseJson(_xhr.responseText, null);
                        if (response === null) {
                            _rej('Invalid JSON response');
                            return;
                        }
                        _res(response);
                        return;
                    }

                    _res(_xhr.responseText);
                }
                _xhr.onerror = () => _rej(_xhr.statusText || 'Network error');
                _xhr.withCredentials = _cred;
                if (_cType) _xhr.setRequestHeader("Content-Type", _cType);
                _xhr.send(_formData);
            });
        },

        register = () => {

            window.wixDevelopersAnalytics.register(APP_CLIENT_ID, (event, data) => {
                switch (event) {
                    case 'productPageLoaded':
                        if (typeof PPrint === 'function') return start(data);
                        loadScript('https://pitchprint.io/x/js/pprint.js', _ => start(data));

                        break;

                    case 'Purchase':
                        storeOrders(data);
                        writeStorage('addedToCart', [])
                        break;

                    case 'AddToCart':
                        if (getApiKey()) {
                            const cartItems = readStorageObject('cartItems'),
                                existingItemIndex = cartItems[data.id] ? cartItems[data.id].findIndex(item => item.id === data.id) : -1,
                                addedToCart = readStorageArray('addedToCart');

                            if (addedToCart.length === 0 && window.ppclient?.vars?.projectId) {
                                data['projectId'] = [window.ppclient.vars.projectId]; // Wrap projectId in an array
                                addedToCart.push(data);

                            } else {
                                const existingItem = addedToCart.find(item => item.id === data.id && item.variantId === data.variantId);

                                if (existingItem && window.ppclient?.vars?.projectId) {
                                    // If variant is the same, update projectId array
                                    existingItem['projectId'].push(window.ppclient.vars.projectId);

                                } else if (!existingItem && window.ppclient?.vars?.projectId) {
                                    // If variant is different or product not found, push new data
                                    data['projectId'] = [window.ppclient.vars.projectId]; // Wrap projectId in an array
                                    addedToCart.push(data);

                                } else {
                                    addedToCart.push(data);
                                }
                            }
                            writeStorage('cartItems', cartItems)
                            writeStorage('addedToCart', addedToCart)

                        }
                        clearDesign(data.id);

                        break;

                    case 'RemoveFromCart':
                        if (getApiKey()) clearFromCart(data.id)
                        break;

                    case 'PageView':
                        if (getApiKey()) {
                            if (data.pageTypeIdentifier === 'shopping_cart' || data.pageTypeIdentifier === 'product_page') {
                                setTimeout(setCartImages, 1000);
                                removeLineItem();
                                removeProjectLineItem();
                            }
                            if (data.pageTypeIdentifier === 'order_history' || data.pageTypeIdentifier === "member_page") {
                                loadScript('https://pitchprint.io/x/js/pprint.js', () => start(data));
                            }
                        }
                        break;
                }
            });
        },

        getApiKey = () => {
            const script = document.getElementById('pitchprint-script');
            const src = script?.getAttribute('src') || '';

            if (!src || !src.includes('=')) return null;

            const apiKey = src.split('=').pop();
            return apiKey || null;
        }

    window.wixDevelopersAnalytics ? register() : window.addEventListener('wixDevelopersAnalyticsReady', register);

    window.ppWixSetup = true;
})(void 0);