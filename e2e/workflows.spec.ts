import { test, expect } from '@playwright/test';
const password = 'Browser-test-only-2026';
test('empty setup, inventory, customers, order calculation, payment, export and mobile navigation', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Let’s make it yours.' })).toBeVisible();
  await page.screenshot({ path: '/tmp/na-login.png', fullPage: true, animations: 'disabled' });
  await page.getByLabel('Create password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByLabel('Setup code', { exact: true }).fill('wrong-bootstrap-code');
  await page.getByRole('button', { name: 'Create your workspace' }).click();
  await expect(page.getByText('The setup code is incorrect.', { exact: true })).toBeVisible();
  await page.getByLabel('Setup code', { exact: true }).fill('Browser-bootstrap-code-2026');
  await page.getByRole('button', { name: 'Create your workspace' }).click();
  await expect(page.getByRole('heading', { name: /Good .*Naween/ })).toBeVisible();
  await expect(page.getByText('Ready for your first order')).toBeVisible();
  await page.screenshot({
    path: '/tmp/na-dashboard-empty.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('link', { name: 'Spice inventory', exact: true }).click();
  await page.getByRole('button', { name: 'Add product', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Product name', { exact: true }).fill('Ceylon Cinnamon');
  await dialog.getByLabel('SKU', { exact: true }).fill('CIN-100');
  await dialog.getByLabel('Barcode / QR value').fill('CIN-001');
  await dialog.getByLabel('Category', { exact: true }).fill('Whole spices');
  await dialog.getByLabel('Origin', { exact: true }).fill('Sri Lanka');
  await dialog.getByLabel('Product size').fill('100 g');
  await dialog.getByLabel('Opening stock').fill('50');
  await dialog.getByLabel('Cost per unit (Rs.)').fill('600');
  await dialog.getByLabel('MRP / retail (Rs.)').fill('1000');
  await dialog.getByLabel('Wholesale (Rs.)', { exact: true }).fill('850');
  await dialog.getByRole('button', { name: 'Add product', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ceylon Cinnamon', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Adjust stock for Ceylon Cinnamon' }).click();
  await page.getByLabel('Quantity', { exact: true }).fill('10');
  await page.getByLabel('Adjustment note').fill('Test delivery');
  await page.getByRole('button', { name: 'Save stock adjustment' }).click();
  await expect(page.getByText('60', { exact: true }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Customers', exact: true }).click();
  await page.getByRole('button', { name: 'Add customer', exact: true }).first().click();
  await page.getByLabel('Business / customer name').fill('Test Spice Shop');
  await page.getByLabel('Contact person').fill('Test Buyer');
  await page.getByLabel('Phone number', { exact: true }).fill('0771234567');
  await page.getByLabel('Email address').fill('buyer@example.com');
  await page.getByRole('dialog').getByRole('button', { name: 'Add customer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Test Spice Shop', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Sales orders', exact: true }).click();
  await page.getByRole('link', { name: 'Create order', exact: true }).click();
  await page.getByLabel('Customer', { exact: true }).selectOption({ label: 'Test Spice Shop' });
  await page.getByRole('textbox', { name: 'Find a product by name or SKU…' }).fill('Cinnamon');
  await page.getByRole('button', { name: /Ceylon Cinnamon CIN-100/ }).click();
  await page.getByRole('spinbutton', { name: 'Quantity for Ceylon Cinnamon' }).fill('5');
  await expect(page.getByText('Rs. 1,000.00 × 5 =')).toBeVisible();
  await page.getByLabel('Manual volume discount').selectOption('2');
  await page.getByLabel('Amount paid now (Rs.)').fill('900');
  await page.screenshot({
    path: '/tmp/na-order-builder.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Review order' }).click();
  await expect(page.getByRole('dialog')).toContainText('Rs. 4,900.00');
  await page.getByRole('button', { name: 'Create order', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('NA-000001');
  await expect(page.getByRole('dialog')).toContainText('Rs. 4,000.00');
  await page.screenshot({ path: '/tmp/na-invoice.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Record payment', exact: true }).click();
  await page.getByLabel('Amount collected (Rs.)').fill('4000');
  await page.getByRole('button', { name: 'Record payment', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('Paid', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('link', { name: 'Reports & insights', exact: true }).click();
  await expect(page.getByText('Rs. 1,900.00').first()).toBeVisible();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  const exported = await downloadEvent;
  expect(exported.suggestedFilename()).toBe('na-sales-report.csv');
  await page.getByRole('link', { name: 'Scan & labels', exact: false }).click();
  await page.getByLabel('Barcode, QR value or product SKU').fill('CIN-001');
  await page.getByRole('button', { name: 'Find product', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ceylon Cinnamon', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Print product labels', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByText('NA DISTRIBUTORS', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  for (const [name, heading] of [
    ['Payment reminders', 'Keep payments moving.'],
    ['Accounting', 'Your numbers, ready to travel.'],
    ['Team & access', 'Your team. The right access.'],
    ['Settings', 'Workspace settings'],
    ['Mobile workspace', 'Take your workspace with you.'],
  ] as const) {
    await page.getByRole('link', { name, exact: true }).click();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Business name', { exact: true }).fill('NA Distributors');
  await page.getByLabel('Phone number', { exact: true }).fill('0112345678');
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByText('Workspace settings saved to the database.')).toBeVisible();
  await page.getByRole('link', { name: 'Team & access', exact: true }).click();
  await page
    .locator('.team-card')
    .filter({ hasText: 'Anura Gunasekara' })
    .getByRole('button', { name: 'Set password & access' })
    .click();
  await page.getByLabel('Set temporary password').fill('Inventory-test-only-2026');
  await page.getByRole('button', { name: 'Save team member' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: 'Sales orders', exact: true }).click();
  await page.getByRole('link', { name: 'Create order', exact: true }).click();
  await page.getByLabel('Customer', { exact: true }).selectOption({ label: 'Test Spice Shop' });
  await page.getByRole('textbox', { name: 'Barcode or SKU for order' }).fill('CIN-001');
  await page.locator('.scan-inline').getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Quantity for Ceylon Cinnamon' })).toHaveValue(
    '1',
  );
  await page.getByRole('button', { name: 'Review order' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Create order', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('NA-000002');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('link', { name: 'Payment reminders', exact: true }).click();
  await page.getByRole('button', { name: 'Prepare reminder' }).click();
  await expect(page.getByLabel('Reminder message')).toHaveValue(/Rs. 1,000.00/);
  await page.getByRole('button', { name: 'Save reminder draft' }).click();
  await expect(page.getByText('Draft · not sent', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Accounting', exact: true }).click();
  const accountingDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON', exact: true }).click();
  expect((await accountingDownload).suggestedFilename()).toBe('NA-quickbooks-style-invoices.json');
  await expect(page.getByText('2 invoices; no data sent to quickbooks')).toBeVisible();
  await page.getByRole('link', { name: 'Reports & insights', exact: true }).click();
  await page.getByRole('button', { name: 'Monthly statement', exact: true }).click();
  const pdfDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
  expect((await pdfDownload).suggestedFilename()).toMatch(/^NA-statement-.*\.pdf$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await page.screenshot({
    path: '/tmp/na-dashboard-populated.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: '/tmp/na-mobile-dashboard.png',
    fullPage: true,
    animations: 'disabled',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Spice inventory', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Spice inventory', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: '/tmp/na-mobile-inventory.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('button', { name: 'Switch user' }).click();
  await page.getByLabel('Username', { exact: true }).fill('anura');
  await page.getByLabel('Password', { exact: true }).fill('Inventory-test-only-2026');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Make your account secure' })).toBeVisible();
  await page.getByLabel('Current password', { exact: true }).fill('Inventory-test-only-2026');
  await page.getByLabel('New password', { exact: true }).fill('Personal-test-only-2026');
  await page.getByLabel('Confirm new password', { exact: true }).fill('Personal-test-only-2026');
  await page.getByRole('button', { name: 'Change password', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Good .*Anura/ })).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('link', { name: 'Sales orders', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Spice inventory', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add product', exact: true })).toBeVisible();
  expect(await page.evaluate(async () => (await fetch('/api/users')).status)).toBe(403);
  expect(errors).toEqual([]);
});
