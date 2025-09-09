# Free Sample Component Configuration Guide

## Overview

The Free Sample component automatically adds a free sample product to the customer's cart when they reach a specified spending threshold. This feature encourages customers to increase their cart value to unlock a free sample.

## Features

- **Automatic sample addition** when threshold is reached
- **Dynamic progress bar** showing progress towards the threshold
- **Customizable threshold amount** and sample product
- **Responsive design** that works in both cart page and cart drawer
- **Automatic hiding** of sample products from collections and search
- **Mobile-first design** with full responsive support

## Setup Instructions

### 1. Enable the Feature

1. Go to your Shopify Admin
2. Navigate to **Online Store > Themes**
3. Click **Customize** on your theme
4. Go to **Theme settings**
5. Go to **Cart section**
6. Find the **Cart Free Sample** section
7. Enable **"Enable Free Sample Feature"**

### 2. Configure Basic Settings

Configure the following required settings:

#### **Threshold Amount**

- Set the minimum cart value required to unlock the free sample
- Enter amount in your store's currency (e.g., 250 for $250)

#### **Sample Product**

- Select the product that will be given as a free sample

**Important**:
This product should have its price set to $0.00 and set theme template **"sample"**

#### **Progress Message**

- Customize the message shown to customers
- Must include `[amount]` placeholder (e.g., "Add [amount] more to get a free sample!")
- The `[amount]` will be automatically replaced with the remaining amount needed

#### **Success Message**

- Set the message shown when the threshold is reached
- Default: "🎉 Congratulations! Free sample unlocked!"

If needed, manually add the component by including:

```liquid
{% render 'cart-free-sample' %}
```

## Customization Options

### Visual Customization

You can customize the appearance through theme settings:

- **Background Color**: Component background color
- **Progress Bar Color**: Color of the progress bar fill
- **Progress Track Color**: Color of the progress bar track

### Advanced Configuration

#### Hiding Sample Products

Sample products are automatically hidden from:

- Collection pages
- Search results
- Related products
- Featured collections

This is achieved by checking `product.template_suffix == 'sample'`.

## Technical Details

### How It Works

1. **Threshold Detection**: JavaScript monitors cart total price
2. **Automatic Addition**: When threshold is reached, sample product is added
3. **Dynamic Updates**: Progress bar and messages update in real-time
4. **Automatic Removal**: Sample is removed if cart total drops below threshold
5. **Component Hiding**: Component hides when sample is successfully added

## Troubleshooting

### Component Not Showing

1. Verify the feature is enabled in theme settings
2. Check that threshold and sample product are configured
3. Ensure cart has regular (non-sample) products
4. Verify the component is included in cart templates

### Sample Product Issues

1. Ensure sample product price is set to $0.00
2. Verify product uses `product.sample` template
3. Check that product is not set as "Hidden" or "Draft"

### Progress Not Updating

1. Check browser console for JavaScript errors
2. Verify cart total calculation excludes sample products
3. Ensure threshold amount is correctly configured

### Sample Not Adding Automatically

1. Verify sample product ID is correctly configured
2. Check that sample product variant exists and is available
3. Ensure JavaScript is not blocked by content blockers
