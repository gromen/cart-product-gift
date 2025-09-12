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

  animateProgressBarCSS(progressElement, targetValue) {
    // Round target value to nearest 5% for data attributes
    const roundedTarget = Math.round(targetValue / 5) * 5;

    progressElement.setAttribute('data-animate-to', roundedTarget);
    progressElement.classList.add('cartFreeSample__progress--animate');
    progressElement.value = targetValue;
    progressElement.textContent = `${targetValue}%`;

    // Remove animation class after animation completes
    setTimeout(() => {
      progressElement.classList.remove('cartFreeSample__progress--animate');
    }, 450); // Slightly longer than CSS animation duration
  }

  updateFreeSampleDisplay(freeProductSample, cartTotal, threshold) {
    const remainingAmount = threshold - cartTotal;
    const progressPercentage = Math.min(
      Math.round((cartTotal * 100) / threshold),
      100
    );

    const progressElement = freeProductSample.querySelector(
      '.js-cartFreeSampleProgress'
    );

    if (progressElement) {
      // Animate progress with CSS animation
      this.animateProgressBarCSS(progressElement, progressPercentage);

      progressElement.setAttribute(
        'aria-label',
        `Progress towards free sample: ${progressPercentage}% complete`
      );
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
      const isCountryPL = Shopify.country === 'PL';
      // Show progress message
      const formattedAmount = new Intl.NumberFormat(
        `${isCountryPL ? 'pl-PL' : 'en-US'}`,
        {
          style: 'currency',
          currency: `${isCountryPL ? 'PLN' : 'USD'}`,
        }
      ).format(remainingAmount / 100);

      const messageText = progressMessage.replace('[amount]', formattedAmount);

      messageContainer.innerHTML = `<span class='cartFreeSample__messageText' id="free-sample-progress-text">${messageText}</span>`;
    } else {
      messageContainer.innerHTML = `<span class='cartFreeSample__messageSuccess' id="free-sample-success-text">${successMessage}</span>`;
    }
  }

  freeProductSampleHandler(parsedState) {
    const context = this.prepareSampleContext(parsedState);
    if (!context.isValid) return;

    this.processSampleComponents(context);
    this.handleSampleAddition(context);
  }

  prepareSampleContext(parsedState) {
    const freeProductSamples = document.querySelectorAll('.js-cartFreeSample');
    const nonSampleItems = parsedState.items.filter(
      (item) => !this.isSampleProduct(item)
    );
    const sampleItems = parsedState.items.filter((item) =>
      this.isSampleProduct(item)
    );

    return {
      samples: freeProductSamples,
      cartItems: parsedState.items,
      nonSampleItems,
      sampleItems,
      cartTotal: parsedState.total_price,
      itemCount: parsedState.item_count,
      currency: window.Shopify?.currency?.active || 'PLN',
      isValid: freeProductSamples.length > 0,
    };
  }

  isSampleInCart(cartItems, sampleProductId) {
    return cartItems.some((item) => {
      const isSample = this.isSampleProduct(item);
      const sameVariant =
        item.variant_id.toString() === sampleProductId.toString();
      return isSample || sameVariant;
    });
  }

  processSampleComponents(context) {
    context.samples.forEach((sampleComponent) => {
      const threshold = parseInt(sampleComponent.dataset.threshold);
      const sampleProductId = sampleComponent.dataset.sampleProductId;

      // Skip if no sample product configured
      if (!sampleProductId) return;

      // Hide if sample already in cart or cart is empty (non-samples)
      if (
        this.isSampleInCart(context.cartItems, sampleProductId) ||
        context.itemCount === 0 ||
        context.nonSampleItems.length === 0
      ) {
        sampleComponent.classList.add('hidden');
        return;
      }

      // Show component if there are regular products
      sampleComponent.classList.remove('hidden');

      // Update the display with current cart state
      this.updateFreeSampleDisplay(
        sampleComponent,
        context.cartTotal,
        threshold,
        context.currency
      );
    });

    // Handle sample removal if needed
    if (
      context.itemCount === 0 ||
      context.nonSampleItems.length === 0 ||
      this.shouldRemoveSamples(context)
    ) {
      this.removeSampleProductIfExists({ items: context.cartItems });
    }
  }

  shouldRemoveSamples(context) {
    const anyThreshold = Array.from(context.samples).find((element) => {
      return parseInt(element.dataset.threshold || '0');
    });

    if (!anyThreshold) return false;

    const threshold = parseInt(anyThreshold.dataset.threshold);
    return context.cartTotal < threshold;
  }

  handleSampleAddition(context) {
    // Check if any threshold is reached
    const thresholdReached = Array.from(context.samples).some((element) => {
      const threshold = parseInt(element.dataset.threshold || '0');
      return context.cartTotal >= threshold;
    });

    if (!thresholdReached) return;

    // Get sample product ID from first component
    const sampleProductId = context.samples[0]?.dataset.sampleProductId;
    if (
      !sampleProductId ||
      this.isSampleInCart(context.cartItems, sampleProductId)
    ) {
      return;
    }

    this.addSampleToCart(sampleProductId)
      .then(() => this.handleSampleAddSuccess())
      .catch((error) => this.handleSampleAddError(error));
  }

  async addSampleToCart(sampleProductId) {
    const body = JSON.stringify({
      items: [
        {
          id: parseInt(sampleProductId),
          quantity: 1,
          properties: { free_sample: 'true' },
        },
      ],
      sections: this.getSectionsToRender().map((section) => section.section),
      sections_url: window.location.pathname,
    });

    const response = await fetch(`${routes.cart_add_url}`, {
      ...fetchConfig(),
      ...{ body },
    });

    const responseText = await response.text();
    const newState = JSON.parse(responseText);

    if (newState.errors || newState.status) {
      throw new Error(
        `Cart API Error: ${newState.errors || newState.description || 'Unknown error'}`
      );
    }

    // Update cart sections
    this.getSectionsToRender().forEach((section) => {
      const elementToReplace =
        document.getElementById(section.id)?.querySelector(section.selector) ||
        document.getElementById(section.id);

      if (elementToReplace && newState.sections[section.section]) {
        elementToReplace.innerHTML = this.getSectionInnerHTML(
          newState.sections[section.section],
          section.selector
        );
      }
    });

    return newState;
  }

  /**
   * Handles successful sample addition
   */
  handleSampleAddSuccess() {
    // Hide all free sample components after 2 seconds
    const allSampleComponents = document.querySelectorAll('.js-cartFreeSample');
    allSampleComponents.forEach((component) => {
      setTimeout(() => component.classList.add('hidden'), 2000);
    });

    this.showFreeSampleNotification();
  }

  handleSampleAddError(error) {
    console.error('Free sample error:', error);
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
      updates,
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
        allFreeProductSamples.forEach((component) => {
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
        console.error('Free sample error:', error);
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
