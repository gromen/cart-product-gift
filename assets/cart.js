class CartRemoveButton extends HTMLElement {
  constructor() {
    super();

    this.addEventListener('click', (event) => {
      event.preventDefault();
      const cartItems =
        this.closest('cart-items') || this.closest('cart-drawer-items');
      cartItems.updateQuantity(this.dataset.index, 0, event);
    });
  }
}

customElements.define('cart-remove-button', CartRemoveButton);

class CartItems extends HTMLElement {
  constructor() {
    super();
    this.lineItemStatusElement =
      document.getElementById('shopping-cart-line-item-status') ||
      document.getElementById('CartDrawer-LineItemStatus');

    const debouncedOnChange = debounce((event) => {
      this.onChange(event);
    }, ON_CHANGE_DEBOUNCE_TIMER);

    this.addEventListener('change', debouncedOnChange.bind(this));
  }

  cartUpdateUnsubscriber = undefined;

  connectedCallback() {
    this.cartUpdateUnsubscriber = subscribe(
      PUB_SUB_EVENTS.cartUpdate,
      (event) => {
        if (event.source === 'cart-items') {
          return;
        }
        return this.onCartUpdate();
      }
    );

    // Initialize free sample handler on page load
    fetch(window.Shopify.routes.root + 'cart.js')
      .then((response) => response.json())
      .then((parsedState) => {
        this.freeProductSampleHandler(parsedState);
      })
      .catch((error) => {
        console.error(error);
      });
  }

  disconnectedCallback() {
    if (this.cartUpdateUnsubscriber) {
      this.cartUpdateUnsubscriber();
    }
  }

  resetQuantityInput(id) {
    const input = this.querySelector(`#Quantity-${id}`);
    input.value = input.getAttribute('value');
    this.isEnterPressed = false;
  }

  setValidity(event, index, message) {
    event.target.setCustomValidity(message);
    event.target.reportValidity();
    this.resetQuantityInput(index);
    event.target.select();
  }

  validateQuantity(event) {
    const inputValue = parseInt(event.target.value);
    const index = event.target.dataset.index;
    let message = '';

    if (inputValue < event.target.dataset.min) {
      message = window.quickOrderListStrings.min_error.replace(
        '[min]',
        event.target.dataset.min
      );
    } else if (inputValue > parseInt(event.target.max)) {
      message = window.quickOrderListStrings.max_error.replace(
        '[max]',
        event.target.max
      );
    } else if (inputValue % parseInt(event.target.step) !== 0) {
      message = window.quickOrderListStrings.step_error.replace(
        '[step]',
        event.target.step
      );
    }

    if (message) {
      this.setValidity(event, index, message);
    } else {
      event.target.setCustomValidity('');
      event.target.reportValidity();
      this.updateQuantity(
        index,
        inputValue,
        event,
        document.activeElement.getAttribute('name'),
        event.target.dataset.quantityVariantId
      );
    }
  }

  onChange(event) {
    this.validateQuantity(event);
  }

  onCartUpdate() {
    if (this.tagName === 'CART-DRAWER-ITEMS') {
      return fetch(`${routes.cart_url}?section_id=cart-drawer`)
        .then((response) => response.text())
        .then((responseText) => {
          const html = new DOMParser().parseFromString(
            responseText,
            'text/html'
          );
          const selectors = ['cart-drawer-items', '.cart-drawer__footer'];
          for (const selector of selectors) {
            const targetElement = document.querySelector(selector);
            const sourceElement = html.querySelector(selector);
            if (targetElement && sourceElement) {
              targetElement.replaceWith(sourceElement);
            }
          }
        })
        .catch((e) => {
          console.error(e);
        });
    } else {
      return fetch(`${routes.cart_url}?section_id=main-cart-items`)
        .then((response) => response.text())
        .then((responseText) => {
          const html = new DOMParser().parseFromString(
            responseText,
            'text/html'
          );
          const sourceQty = html.querySelector('cart-items');
          this.innerHTML = sourceQty.innerHTML;
        })
        .catch((e) => {
          console.error(e);
        });
    }
  }

  getSectionsToRender() {
    return [
      {
        id: 'main-cart-items',
        section: document.getElementById('main-cart-items').dataset.id,
        selector: '.js-contents',
      },
      {
        id: 'cart-icon-bubble',
        section: 'cart-icon-bubble',
        selector: '.shopify-section',
      },
      {
        id: 'cart-live-region-text',
        section: 'cart-live-region-text',
        selector: '.shopify-section',
      },
      {
        id: 'main-cart-footer',
        section: document.getElementById('main-cart-footer').dataset.id,
        selector: '.js-contents',
      },
    ];
  }

  updateQuantity(line, quantity, event, name, variantId) {
    this.enableLoading(line);

    const body = JSON.stringify({
      line,
      quantity,
      sections: this.getSectionsToRender().map((section) => section.section),
      sections_url: window.location.pathname,
    });
    const eventTarget =
      event.currentTarget instanceof CartRemoveButton ? 'clear' : 'change';

    fetch(`${routes.cart_change_url}`, { ...fetchConfig(), ...{ body } })
      .then((response) => {
        return response.text();
      })
      .then((state) => {
        const parsedState = JSON.parse(state);

        CartPerformance.measure(
          `${eventTarget}:paint-updated-sections"`,
          () => {
            const quantityElement =
              document.getElementById(`Quantity-${line}`) ||
              document.getElementById(`Drawer-quantity-${line}`);
            const items = document.querySelectorAll('.cart-item');

            if (parsedState.errors) {
              quantityElement.value = quantityElement.getAttribute('value');
              this.updateLiveRegions(line, parsedState.errors);
              return;
            }

            this.classList.toggle('is-empty', parsedState.item_count === 0);
            const cartDrawerWrapper = document.querySelector('cart-drawer');
            const cartFooter = document.getElementById('main-cart-footer');

            if (cartFooter)
              cartFooter.classList.toggle(
                'is-empty',
                parsedState.item_count === 0
              );
            if (cartDrawerWrapper)
              cartDrawerWrapper.classList.toggle(
                'is-empty',
                parsedState.item_count === 0
              );

            this.getSectionsToRender().forEach((section) => {
              const elementToReplace =
                document
                  .getElementById(section.id)
                  .querySelector(section.selector) ||
                document.getElementById(section.id);
              elementToReplace.innerHTML = this.getSectionInnerHTML(
                parsedState.sections[section.section],
                section.selector
              );
            });

            const updatedValue = parsedState.items[line - 1]
              ? parsedState.items[line - 1].quantity
              : undefined;
            let message = '';
            if (
              items.length === parsedState.items.length &&
              updatedValue !== parseInt(quantityElement.value)
            ) {
              if (typeof updatedValue === 'undefined') {
                message = window.cartStrings.error;
              } else {
                message = window.cartStrings.quantityError.replace(
                  '[quantity]',
                  updatedValue
                );
              }
            }
            this.updateLiveRegions(line, message);

            const lineItem =
              document.getElementById(`CartItem-${line}`) ||
              document.getElementById(`CartDrawer-Item-${line}`);
            if (lineItem && lineItem.querySelector(`[name="${name}"]`)) {
              cartDrawerWrapper
                ? trapFocus(
                    cartDrawerWrapper,
                    lineItem.querySelector(`[name="${name}"]`)
                  )
                : lineItem.querySelector(`[name="${name}"]`).focus();
            } else if (parsedState.item_count === 0 && cartDrawerWrapper) {
              trapFocus(
                cartDrawerWrapper.querySelector('.drawer__inner-empty'),
                cartDrawerWrapper.querySelector('a')
              );
            } else if (
              document.querySelector('.cart-item') &&
              cartDrawerWrapper
            ) {
              trapFocus(
                cartDrawerWrapper,
                document.querySelector('.cart-item__name')
              );
            }
          }
        );

        CartPerformance.measureFromEvent(`${eventTarget}:user-action`, event);
        this.freeProductSampleHandler(parsedState);
        publish(PUB_SUB_EVENTS.cartUpdate, {
          source: 'cart-items',
          cartData: parsedState,
          variantId: variantId,
        });
      })
      .catch(() => {
        this.querySelectorAll('.loading__spinner').forEach((overlay) =>
          overlay.classList.add('hidden')
        );
        const errors =
          document.getElementById('cart-errors') ||
          document.getElementById('CartDrawer-CartErrors');
        errors.textContent = window.cartStrings.error;
      })
      .finally(() => {
        this.disableLoading(line);
      });
  }

  isSampleProduct(item) {
    // Check if product uses sample template suffix
    if (item.product && item.product.template_suffix === 'sample') {
      return true;
    }

    // Fallback to properties check for backward compatibility
    return item.properties && item.properties.free_sample === 'true';
  }

  updateFreeSampleDisplay(freeProductSample, cartTotal, threshold) {
    const remainingAmount = threshold - cartTotal;
    const progressPercentage = Math.min(
      Math.round((cartTotal * 100) / threshold),
      100
    );

    // Update progress bar
    const progressFill = freeProductSample.querySelector(
      '.cartFreeSample__progressFill'
    );
    const progressText = freeProductSample.querySelector(
      '.cartFreeSample__progressPercentage'
    );

    if (progressFill) {
      progressFill.style.width = `${progressPercentage}%`;
    }
    if (progressText) {
      progressText.textContent = `${progressPercentage}%`;
    }

    // Update message content
    const messageContainer = freeProductSample.querySelector(
      '.cartFreeSample__message'
    );
    if (!messageContainer) return;

    // Get message templates from data attributes or use defaults
    const progressMessage =
      freeProductSample.dataset.progressMessage ||
      'Add [amount] more to get a free sample!';
    const successMessage =
      freeProductSample.dataset.successMessage ||
      '🎉 Congratulations! Free sample unlocked!';

    if (remainingAmount > 0) {
      // Show progress message
      const formattedAmount = new Intl.NumberFormat('pl-PL', {
        style: 'currency',
        currency: 'PLN',
      }).format(remainingAmount / 100);

      const messageText = progressMessage.replace('[amount]', formattedAmount);

      messageContainer.innerHTML = `<span class='cartFreeSample__messageText'>${messageText}</span>`;
      freeProductSample.classList.remove('cartFreeSample--completed');
    } else {
      // Show success message
      messageContainer.innerHTML = `<span class='cartFreeSample__messageSuccess'>${successMessage}</span>`;
      freeProductSample.classList.add('cartFreeSample--completed');
    }
  }

  freeProductSampleHandler(parsedState) {
    const freeProductSamples = document.querySelectorAll('.js-cartFreeSample');

    if (freeProductSamples.length === 0) {
      return;
    }

    // Process each free sample component separately
    freeProductSamples.forEach((freeProductSample, index) => {
      const threshold = parseInt(freeProductSample.dataset.threshold);
      let sampleProductId = freeProductSample.dataset.sampleProductId;
      const currentCartTotal = parsedState.total_price;
      const currency = freeProductSample.dataset.currency || 'PLN';

      // Check if threshold is reached and sample product is configured
      if (!sampleProductId) {
        return; // This will only return from the current forEach iteration
      }

      // Check if sample is already in cart at page load/refresh - hide component immediately
      const sampleAlreadyInCartAtStart = parsedState.items.some((item) => {
        const isSample = this.isSampleProduct(item);
        const sameVariant =
          item.variant_id.toString() === sampleProductId.toString();
        return isSample || sameVariant;
      });

      if (sampleAlreadyInCartAtStart) {
        freeProductSample.classList.add('hidden');
        return; // This will only return from the current forEach iteration
      }

      // Check if cart is empty (excluding samples) - remove any existing samples
      const nonSampleItems = parsedState.items.filter(
        (item) => !this.isSampleProduct(item)
      );

      // Hide component if cart is completely empty or has no regular products
      if (parsedState.item_count === 0 || nonSampleItems.length === 0) {
        freeProductSample.classList.add('hidden');
        // Note: removeSampleProductIfExists will be called once outside the loop
        return; // This will only return from the current forEach iteration
      }

      // Show component if there are regular products
      freeProductSample.classList.remove('hidden');

      // Update the display with current cart state
      this.updateFreeSampleDisplay(
        freeProductSample,
        currentCartTotal,
        threshold,
        currency
      );

      // If threshold not reached, we'll handle sample removal later outside the loop
      if (currentCartTotal < threshold) {
        return; // This will only return from the current forEach iteration
      }

      // Check if sample is already in cart (check by variant_id AND by _free_sample property)
      const sampleAlreadyInCart = parsedState.items.some((item) => {
        // Check if this is a sample product
        const isSample = this.isSampleProduct(item);
        // Check if same variant ID
        const sameVariant =
          item.variant_id.toString() === sampleProductId.toString();
        return isSample || sameVariant;
      });

      // Check if sample is already in cart - if so, hide the component since goal is achieved
      if (sampleAlreadyInCart) {
        freeProductSample.classList.add('hidden');
        return; // This will only return from the current forEach iteration
      }
    }); // End of forEach loop

    // Handle sample removal logic once, outside the component loop
    if (
      parsedState.item_count === 0 ||
      parsedState.items.filter((item) => !this.isSampleProduct(item)).length ===
        0 ||
      parsedState.total_price <
        parseInt(
          document.querySelector('.js-cartFreeSample')?.dataset.threshold || '0'
        )
    ) {
      this.removeSampleProductIfExists(parsedState);
      return;
    }

    // Check if we should add a sample (only if any component has threshold reached and no sample exists)
    const anyThresholdReached = Array.from(freeProductSamples).some(
      (element) => {
        const threshold = parseInt(element.dataset.threshold);
        return parsedState.total_price >= threshold;
      }
    );

    if (!anyThresholdReached) {
      return;
    }

    // Get sample product ID from any component (they should all be the same)
    const sampleProductId = freeProductSamples[0]?.dataset.sampleProductId;
    if (!sampleProductId) {
      return;
    }

    // Check if sample is already in cart
    const sampleAlreadyInCart = parsedState.items.some((item) => {
      const isSample = this.isSampleProduct(item);
      const sameVariant =
        item.variant_id.toString() === sampleProductId.toString();
      return isSample || sameVariant;
    });

    if (sampleAlreadyInCart) {
      return;
    }

    const body = JSON.stringify({
      items: [
        {
          id: parseInt(sampleProductId),
          quantity: 1,
          properties: {
            free_sample: 'true',
          },
        },
      ],
      sections: this.getSectionsToRender().map((section) => section.section),
      sections_url: window.location.pathname,
    });

    fetch(`${routes.cart_add_url}`, { ...fetchConfig(), ...{ body } })
      .then((response) => {
        return response.text();
      })
      .then((responseText) => {
        const newState = JSON.parse(responseText);

        // Check for errors in response
        if (newState.errors || newState.status) {
          throw new Error(
            `Cart API Error: ${newState.errors || newState.description || 'Unknown error'}`
          );
        }

        // Update cart sections with new state including free sample

        this.getSectionsToRender().forEach((section) => {
          const elementToReplace =
            document
              .getElementById(section.id)
              .querySelector(section.selector) ||
            document.getElementById(section.id);

          if (elementToReplace && newState.sections[section.section]) {
            elementToReplace.innerHTML = this.getSectionInnerHTML(
              newState.sections[section.section],
              section.selector
            );
          }
        });

        // Hide all free sample components since the sample has been added successfully
        const allFreeProductSamples =
          document.querySelectorAll('.js-cartFreeSample');
        allFreeProductSamples.forEach((component, index) => {
          setTimeout(() => {
            component.classList.add('hidden');
          }, 2000);
        });

        // Show success notification
        this.showFreeSampleNotification();
      })
      .catch((error) => {
        console.error(error);
        // Silently handle errors - could add user notification here
      });
  }

  removeSampleProductIfExists(parsedState) {
    // Check if any sample products exist in cart
    const sampleItems = parsedState.items.filter((item) =>
      this.isSampleProduct(item)
    );

    if (sampleItems.length === 0) {
      return;
    }

    // Remove all sample products by setting their quantity to 0
    const updates = {};
    sampleItems.forEach((item) => {
      updates[item.key] = 0;
    });

    const body = JSON.stringify({
      updates: updates,
      sections: this.getSectionsToRender().map((section) => section.section),
      sections_url: window.location.pathname,
    });

    fetch(`${routes.cart_update_url}`, { ...fetchConfig(), ...{ body } })
      .then((response) => response.text())
      .then((responseText) => {
        const newState = JSON.parse(responseText);

        // Update cart sections
        this.getSectionsToRender().forEach((section) => {
          const elementToReplace =
            document
              .getElementById(section.id)
              .querySelector(section.selector) ||
            document.getElementById(section.id);

          if (
            elementToReplace &&
            newState.sections &&
            newState.sections[section.section]
          ) {
            elementToReplace.innerHTML = this.getSectionInnerHTML(
              newState.sections[section.section],
              section.selector
            );
          }
        });

        // Show free sample components again since the sample has been removed
        const allFreeProductSamples =
          document.querySelectorAll('.js-cartFreeSample');
        allFreeProductSamples.forEach((component, index) => {
          // Only show if cart has non-sample items and threshold not yet reached
          const threshold = parseInt(component.dataset.threshold);
          if (newState.total_price < threshold && newState.item_count > 0) {
            component.classList.remove('hidden');

            // Update the display to show correct message (progress instead of congratulations)
            const currency = component.dataset.currency;
            this.updateFreeSampleDisplay(
              component,
              newState.total_price,
              threshold,
              currency
            );
          }
        });
      })
      .catch((error) => {
        // Silently handle errors
      });
  }

  showFreeSampleNotification() {
    const notification = document.querySelector(
      '.cartFreeSample__notification'
    );
    if (!notification) {
      return;
    }

    // Animate in
    setTimeout(() => {
      notification.style.opacity = '1';
      notification.style.transform = 'translateX(0)';
    }, 100);

    // Remove after 4 seconds
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => notification.remove(), 300);
    }, 4000);
  }

  updateLiveRegions(line, message) {
    const lineItemError =
      document.getElementById(`Line-item-error-${line}`) ||
      document.getElementById(`CartDrawer-LineItemError-${line}`);
    if (lineItemError)
      lineItemError.querySelector('.cart-item__error-text').textContent =
        message;

    this.lineItemStatusElement.setAttribute('aria-hidden', true);

    const cartStatus =
      document.getElementById('cart-live-region-text') ||
      document.getElementById('CartDrawer-LiveRegionText');
    cartStatus.setAttribute('aria-hidden', false);

    setTimeout(() => {
      cartStatus.setAttribute('aria-hidden', true);
    }, 1000);
  }

  getSectionInnerHTML(html, selector) {
    return new DOMParser()
      .parseFromString(html, 'text/html')
      .querySelector(selector).innerHTML;
  }

  enableLoading(line) {
    const mainCartItems =
      document.getElementById('main-cart-items') ||
      document.getElementById('CartDrawer-CartItems');
    mainCartItems.classList.add('cart__items--disabled');

    const cartItemElements = this.querySelectorAll(
      `#CartItem-${line} .loading__spinner`
    );
    const cartDrawerItemElements = this.querySelectorAll(
      `#CartDrawer-Item-${line} .loading__spinner`
    );

    [...cartItemElements, ...cartDrawerItemElements].forEach((overlay) =>
      overlay.classList.remove('hidden')
    );

    document.activeElement.blur();
    this.lineItemStatusElement.setAttribute('aria-hidden', false);
  }

  disableLoading(line) {
    const mainCartItems =
      document.getElementById('main-cart-items') ||
      document.getElementById('CartDrawer-CartItems');
    mainCartItems.classList.remove('cart__items--disabled');

    const cartItemElements = this.querySelectorAll(
      `#CartItem-${line} .loading__spinner`
    );
    const cartDrawerItemElements = this.querySelectorAll(
      `#CartDrawer-Item-${line} .loading__spinner`
    );

    cartItemElements.forEach((overlay) => overlay.classList.add('hidden'));
    cartDrawerItemElements.forEach((overlay) =>
      overlay.classList.add('hidden')
    );
  }
}

customElements.define('cart-items', CartItems);

if (!customElements.get('cart-note')) {
  customElements.define(
    'cart-note',
    class CartNote extends HTMLElement {
      constructor() {
        super();

        this.addEventListener(
          'input',
          debounce((event) => {
            const body = JSON.stringify({ note: event.target.value });
            fetch(`${routes.cart_update_url}`, {
              ...fetchConfig(),
              ...{ body },
            }).then(() =>
              CartPerformance.measureFromEvent('note-update:user-action', event)
            );
          }, ON_CHANGE_DEBOUNCE_TIMER)
        );
      }
    }
  );
}
