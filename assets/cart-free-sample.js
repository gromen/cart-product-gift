const CURRENCIES = {
  PLN: 'pl-PL',
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
};

class CartFreeSample extends HTMLElement {
  constructor() {
    super();
    this.cartFreeSample = this.querySelector('.js-cartFreeSample');
    this.progressBar = this.cartFreeSample.querySelector(
      '.js-cartFreeSampleProgress'
    );
    this.messageContainer = this.cartFreeSample.querySelector(
      '.cartFreeSample__message'
    );
    this.threshold = parseInt(this.cartFreeSample.dataset.threshold) || 0;
    this.cartTotal = this.cartFreeSample.dataset.cartTotal;
    this.sampleProductId = this.cartFreeSample.dataset.sampleProductId;
    this.currency = this.cartFreeSample.dataset.currency;
    this.progressMessage = this.cartFreeSample.dataset.progressMessage;
    this.successMessage = this.cartFreeSample.dataset.successMessage;
    this.cartFreeSampleSuccessMessage = document.querySelector(
      'cart-free-sample .js-cartFreeSampleSuccessMessage'
    );
  }

  connectedCallback() {
    if (this.calculateProgressPercentage(this.cartTotal) === 100) {
      this.cartFreeSample.classList.add('cartFreeSample--hidden');
    }
    this.cartUpdateUnsubscriber = subscribe(
      PUB_SUB_EVENTS.cartUpdate,
      (event) =>
        this.onCartUpdateUI(event.cartData.total_price, event.cartData.currency)
    );
    this.onCartUpdateUI(this.cartTotal, this.currency);
  }

  disconnectedCallback() {
    if (this.cartUpdateUnsubscriber) {
      this.cartUpdateUnsubscriber();
    }
  }

  onCartUpdateUI(totalPrice, currency) {
    const remainingAmount = this.threshold - totalPrice;
    const progressPercentage = this.calculateProgressPercentage(totalPrice);
    this.progressBar.value = progressPercentage;
    this.progressBar.textContent = `${progressPercentage}%`;
    this.progressBar.setAttribute(
      'aria-label',
      `Progress towards free sample: ${progressPercentage}% complete`
    );
    this.progressBar.setAttribute('data-animate-to', progressPercentage);
    const message = this.getMessage(
      remainingAmount,
      progressPercentage,
      currency
    );
    this.messageContainer.innerHTML = `<span class='cartFreeSample__messageText' id="free-sample-progress-text">${message}</span>`;
    this.cartFreeSample.classList.toggle(
      'cartFreeSample--hidden',
      progressPercentage === 100
    );
    this.cartFreeSampleSuccessMessage.classList.toggle(
      'cartFreeSample--hidden',
      progressPercentage !== 100
    );
  }

  getMessage(remainingAmount, progressPercentage, currency) {
    const formattedRemainingAmount = new Intl.NumberFormat(
      `${CURRENCIES[currency]}`,
      {
        style: 'currency',
        currency,
      }
    ).format(remainingAmount / 100);

    if (progressPercentage === 100) {
      return this.successMessage;
    } else {
      return this.progressMessage.replace('[amount]', formattedRemainingAmount);
    }
  }

  calculateProgressPercentage(totalPrice) {
    return Math.min(Math.round((totalPrice * 100) / this.threshold), 100);
  }
}

customElements.define('cart-free-sample', CartFreeSample);
