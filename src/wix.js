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

        loadScript = (src, onLoadFnc) => {
            if (document.querySelector(`[src="${src}"]`))
                return (typeof onLoadFnc === 'function') ? onLoadFnc() : null;

            let script = document.createElement('script');
            script.onload = onLoadFnc;
            script.src = src;
            document.querySelector('head').appendChild(script);
        },

        parseJson = str => {
            try {
                return JSON.parse(str);
            } catch (e) { return 0 }
        },

        decodeValues = param => {
            const value = typeof param === 'sring' ? parseJson(decodeURIComponent(param)) : param;
            if (value.projectId) value.preview = `${PREVIEWPATH}${value.projectId}_1.jpg`;
            return value;
        },

        start = async param => {
            if (window.location.href.includes('/account/my-orders') || param.pageTypeIdentifier === "member_page")
                return startClientAccount(param);

            param = param || {};

            let productId = param.productId,
                values = storeProjects[productId],
                apiKey = document.getElementById('pitchprint-script')?.src?.split('=')[1],
                store = window.localStorage.getItem('pprint-wx') || {};


            if (userData === undefined) {
                await comm(`https://${window.location.hostname}/_api/apps/current-member/${APP_CLIENT_ID}`, '', 'GET', 'json', true)
                    .then(data => {
                        userId = String(data?.member?.id || 'guest');
                        userData = data?.member || '';
                    })
                    .catch(e => console.log(e));
            }


            if (typeof store === 'string') store = parseJson(store);
            let currValues = store[productId] || {};
            if (typeof currValues === 'string') currValues = decodeValues(currValues);

            if (!values) {
                values = await fetch('https://api.pitchprint.com/admin/wix-product-tag', {
                    method: 'post',
                    headers: { 'Accept': 'application/json, text/plain, */*', 'Content-Type': 'application/json' },
                    body: JSON.stringify({ apiKey: apiKey, productId: productId })
                }).then(d => d.json());
            }
            if (values?.designId) storeProjects[productId] = values;
            if (!values?.designId && !currValues.projectId) return;

            let elmParent = document.querySelector('[data-hook="product-prices-wrapper"]');
            if (!elmParent) {
                let cartElem = document.querySelector(`[data-hook="add-to-cart"], [aria-label="Add to Cart"], '[aria-label="Ajouter au panier"]',${window.PPCLIENT?.customCartButton}`);
                elmParent = cartElem?.parentNode;
            }
            if (!elmParent) return console.log('Weird, PitchPrint needs the pricing element to hook div to');

            const btnSec = document.getElementById('pp_main_btn_sec');
            if (btnSec) btnSec.remove();
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
                let store = parseJson(window.localStorage.getItem('pprint-wx') || '{}');

                if (event.data.clear) {
                    if (store) delete store?.[productId];
                } else {
                    if (store) store[productId] = JSON.parse(decodeURIComponent(event.data.values));
                }

                window.localStorage.setItem('pprint-wx-c', JSON.stringify(store));
                window.localStorage.setItem('pprint-wx', JSON.stringify(store));

                if (event.data.clear)
                    window.location.reload();
            });
        },

        clearDesign = (productId) => {
            if (!window.ppclient) return;

            var projects = window.localStorage.getItem('pp-projects') || {},
                store = window.localStorage.getItem('pprint-wx');

            if (typeof store === 'string') store = parseJson(store);
            if (typeof projects === 'string') projects = parseJson(projects);

            if (store) {
                let storeValues = store[productId] || {};
                var values = projects?.[productId] || [];
                if (typeof storeValues === 'string') storeValues = decodeValues(storeValues);
                values.push(storeValues)
                projects[productId] = values
                window.localStorage.setItem('pp-projects', JSON.stringify(projects))
            }

            setTimeout(() => {
                delete store[productId];
                window.localStorage.setItem('pprint-wx', JSON.stringify(store));
                window.location.reload();
            }, 500);
        },

        clearFromCart = (productId) => {
            var projects = window.localStorage.getItem('pp-projects') || {},
                addedToCart = parseJson(window.localStorage.getItem('addedToCart') || '[]') || [];

            if (typeof projects === 'string') projects = parseJson(projects);

            setTimeout(() => {
                addedToCart = addedToCart.filter(item => item.id !== productId);
                delete projects[productId];
                window.localStorage.setItem('addedToCart', JSON.stringify(addedToCart))
                window.localStorage.setItem('pp-projects', JSON.stringify(projects));
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
            window.ppclient.on('app-validated', initSaveForLater());
        },

        storeOrders = param => {

            if (!param?.contents) return;
            let storeData = window.localStorage.getItem('pp-projects') || {}, doSave;

            if (typeof storeData === 'string') storeData = parseJson(storeData);

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
                    .then((response) => response.json())
                    .then(() => window.localStorage.removeItem('pp-projects'))
                    .catch(console.error);
            }
        },

        setCartImages = () => {
            var element = document.querySelectorAll('[data-hook="product-thumbnail-media"]'),
                cartItems = JSON.parse(window.localStorage.getItem('addedToCart'));
            if (element && cartItems) {
                cartItems.forEach((item, idx) => {
                    if (item.projectId?.length > 0) {
                        var lastProjectId = item.projectId[item.projectId.length - 1];
                        if (element[idx]) {
                            console.log(element, item)
                            element[idx].src = `${PREVIEWPATH}${lastProjectId}_1.jpg?`;
                            element[idx].srcset = `${PREVIEWPATH}${lastProjectId}_1.jpg?`;
                        }
                    }
                });
            }
        },

        removeLineItem = () => {

            const _cartItems = JSON.parse(window.localStorage.getItem('addedToCart'))
            const removeButtons = document.querySelectorAll('[data-hook="CartItemDataHook.remove"]');

            removeButtons.forEach((button, index) => {
                button.addEventListener('click', () => {
                    _cartItems.splice(index, 1);
                    window.localStorage.setItem("addedToCart", JSON.stringify(_cartItems))
                    setTimeout(setCartImages(), 500)
                });
            });
        },

        removeProjectLineItem = () => {
            const _cartItems = JSON.parse(window.localStorage.getItem('addedToCart')),
                _quantity = document.querySelectorAll('[data-hook="CartItemDataHook.quantity"] input'),
                _decrement = document.querySelectorAll('[name="decrement"]');

            _decrement.forEach((button, index) => {
                button.addEventListener('click', () => {
                    if (_cartItems[index].projectId && _cartItems[index].projectId.length > 1 && _quantity[index].value > 1) {
                        _cartItems[index].projectId.splice(-1);
                        console.log(_cartItems)
                        window.localStorage.setItem('addedToCart', JSON.stringify(_cartItems));
                        setTimeout(setCartImages(), 500);
                    }
                })
            })
        },

        initSaveForLater = () => {
            const wrapper = document.querySelector('._2JOHk,#TPAMultiSection_knia8al9,#TPAMultiSection_kw4yte5f,[id^="TPAMultiSection_"]');

            if (wrapper && !document.getElementById('pp_mydesigns_div'))
                wrapper.insertAdjacentHTML('afterbegin', '<div id="pp_mydesigns_div"></div>');

            if (!wrapper && window.PPCLIENT?.customAccountDivSel && !document.getElementById('pp_mydesigns_div'))
                document.querySelector(window.PPCLIENT.customAccountDivSel).insertAdjacentHTML('afterbegin', '<div id="pp_mydesigns_div"></div>');

            const run = () => {
                const table = document.getElementById('pp-recent-table');
                if (table) {
                    clearInterval(checkTable); // Clear the interval if the table is present
                    table.addEventListener('click', evt => {
                        if (evt.target?.dataset?.fnc === 'clone') {
                            duplicateProject(evt.target.dataset.idx, evt.target.dataset.resume === 'true');
                        }
                    });
                }
            }
            run();
            const checkTable = setInterval(run, 1000);
        },

        duplicateProject = (value, resume) => {

            let project = window.ppclient.vars.projects[parseInt(value)],
                storeData = JSON.parse(window.localStorage.getItem('pprint-wx')) || {},
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
            window.localStorage.setItem('pprint-wx', JSON.stringify(storeData));
        },

        comm = (_url, _data, _method, _dType = 'json', _cred = true) => {
            return new Promise((_res, _rej) => {
                let _cType, _formData = '';

                if (_data && _method === 'GET') {
                    _formData = [];
                    for (let _key in _data) {
                        if (typeof _data[_key] !== 'undefined' && _data[_key] !== null) _formData.push(encodeURIComponent(_key) + '=' + encodeURIComponent(_data[_key]));
                    }
                    _formData = _formData.join('&').replace(/%20/g, '+');
                }
                if (_method === 'POST') {
                    _cType = 'application/x-www-form-urlencoded';
                    if (_data) _formData = JSON.stringify(_data);
                } else if (_method === 'GET') {
                    _cType = 'text/plain';
                    if (_formData) _url += `?${_formData}`;
                }

                const _xhr = new XMLHttpRequest();
                _xhr.open(_method, _url, true);
                _xhr.onload = () => {
                    if (_xhr.status == 404) {
                        _rej(_xhr.statusText)
                    } else {
                        _res(_dType === 'json' ? JSON.parse(_xhr.responseText) : _xhr.responseText);
                    }
                }
                _xhr.onerror = () => _rej(_xhr.statusText);
                _xhr.withCredentials = (_method.toUpperCase() === 'GET' ? _cred : _cred);
                _xhr.setRequestHeader("Content-Type", _cType);
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
                        window.localStorage.setItem("addedToCart", '[]')
                        break;

                    case 'AddToCart':
                        if (getApiKey()) {
                            const cartItems = parseJson(window.localStorage.getItem('cartItems')) || {},
                                existingItemIndex = cartItems[data.id] ? cartItems[data.id].findIndex(item => item.id === data.id) : -1,
                                addedToCart = parseJson(window.localStorage.getItem('addedToCart')) || [];

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
                            window.localStorage.setItem('cartItems', JSON.stringify(cartItems))
                            window.localStorage.setItem('addedToCart', JSON.stringify(addedToCart))

                        }
                        clearDesign(data.id);

                        break;

                    case 'RemoveFromCart':
                        if (getApiKey()) clearFromCart(data.id)
                        break;

                    case 'PageView':
                        if (getApiKey()) {
                            if (data.pageTypeIdentifier === 'shopping_cart' || data.pageTypeIdentifier === 'product_page') {
                                setCartImages();
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
            var apiKey = document.getElementById('pitchprint-script').src.split('=')[1];
            return apiKey;
        }

    window.wixDevelopersAnalytics ? register() : window.addEventListener('wixDevelopersAnalyticsReady', register);

    window.ppWixSetup = true;
})(void 0);