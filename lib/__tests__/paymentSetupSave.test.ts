import { saveCirclePaymentInstructions } from '../paymentSetupSave';

describe('saveCirclePaymentInstructions (payment-setup save flow)', () => {
  const circleId = 'circle-1';
  const entered = 'Zelle: organizer@example.com';

  test('1. missing token does not call updateCircleSettings', async () => {
    const updateCircleSettings = jest.fn();

    await saveCirclePaymentInstructions({
      token: undefined,
      circleId,
      instructions: entered,
      updateCircleSettings,
    });

    expect(updateCircleSettings).not.toHaveBeenCalled();
  });

  test('2. missing token does not show success', async () => {
    const result = await saveCirclePaymentInstructions({
      token: null,
      circleId,
      instructions: entered,
      updateCircleSettings: jest.fn(),
    });

    expect(result.status).toBe('missing_token');
    expect(result.status).not.toBe('success');
  });

  test('3. missing token does not navigate away', async () => {
    const result = await saveCirclePaymentInstructions({
      token: '',
      circleId,
      instructions: entered,
      updateCircleSettings: jest.fn(),
    });

    expect(result.status).toBe('missing_token');
    expect(result.shouldNavigate).toBe(false);
  });

  test('4. successful API response shows success', async () => {
    const updateCircleSettings = jest.fn().mockResolvedValue({
      id: circleId,
      paymentInstructions: entered,
    });

    const result = await saveCirclePaymentInstructions({
      token: 'tok_valid',
      circleId,
      instructions: entered,
      updateCircleSettings,
    });

    expect(updateCircleSettings).toHaveBeenCalledWith('tok_valid', circleId, {
      paymentInstructions: entered,
    });
    expect(result.status).toBe('success');
  });

  test('5. successful API response navigates away', async () => {
    const result = await saveCirclePaymentInstructions({
      token: 'tok_valid',
      circleId,
      instructions: `  ${entered}  `,
      updateCircleSettings: jest.fn().mockResolvedValue({}),
    });

    expect(result.status).toBe('success');
    expect(result.shouldNavigate).toBe(true);
  });

  test('6. failed API response shows error', async () => {
    const apiError = new Error('Forbidden');
    const result = await saveCirclePaymentInstructions({
      token: 'tok_valid',
      circleId,
      instructions: entered,
      updateCircleSettings: jest.fn().mockRejectedValue(apiError),
    });

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error).toBe(apiError);
    }
  });

  test('7. failed API response does not navigate away', async () => {
    const result = await saveCirclePaymentInstructions({
      token: 'tok_valid',
      circleId,
      instructions: entered,
      updateCircleSettings: jest.fn().mockRejectedValue(new Error('network')),
    });

    expect(result.status).toBe('error');
    expect(result.shouldNavigate).toBe(false);
  });

  test('8a. empty instructions are rejected and do not call the API', async () => {
    const updateCircleSettings = jest.fn();
    const result = await saveCirclePaymentInstructions({
      token: 'tok_valid',
      circleId,
      instructions: '   ',
      updateCircleSettings,
    });

    expect(result.status).toBe('empty_instructions');
    expect(result.shouldNavigate).toBe(false);
    expect(updateCircleSettings).not.toHaveBeenCalled();
  });

  test('8b. 280-character instructions are forwarded unchanged', async () => {
    const updateCircleSettings = jest.fn().mockResolvedValue({});
    const maxLength = 'x'.repeat(280);
    const result = await saveCirclePaymentInstructions({
      token: 'tok_valid',
      circleId,
      instructions: maxLength,
      updateCircleSettings,
    });

    expect(result.status).toBe('success');
    expect(updateCircleSettings).toHaveBeenCalledWith('tok_valid', circleId, {
      paymentInstructions: maxLength,
    });
  });

  test('9. structured destinations are saved and compose the free-text fallback', async () => {
    const updateCircleSettings = jest.fn().mockResolvedValue({});
    const result = await saveCirclePaymentInstructions({
      token: 'tok_valid',
      circleId,
      instructions: '',
      destinations: [
        { method: 'zelle', destination: 'organizer@example.com', memo: 'Include your name' },
        { method: 'cashapp', destination: '$greg' },
      ],
      updateCircleSettings,
    });

    expect(result.status).toBe('success');
    expect(updateCircleSettings).toHaveBeenCalledWith('tok_valid', circleId, {
      paymentDestinations: [
        { method: 'zelle', destination: 'organizer@example.com', memo: 'Include your name' },
        { method: 'cashapp', destination: '$greg' },
      ],
      paymentInstructions:
        'Zelle: organizer@example.com\nInclude your name\nCash App: $greg',
    });
  });

  test('10. empty destinations do not call the API', async () => {
    const updateCircleSettings = jest.fn();
    const result = await saveCirclePaymentInstructions({
      token: 'tok_valid',
      circleId,
      instructions: entered,
      destinations: [{ method: 'venmo', destination: '   ' }],
      updateCircleSettings,
    });

    expect(result.status).toBe('empty_instructions');
    expect(updateCircleSettings).not.toHaveBeenCalled();
  });

  test('8. entered payment instructions remain after failure', async () => {
    const result = await saveCirclePaymentInstructions({
      token: 'tok_valid',
      circleId,
      instructions: entered,
      updateCircleSettings: jest.fn().mockRejectedValue(new Error('server')),
    });

    expect(result.preservedInstructions).toBe(entered);
    expect(result.shouldNavigate).toBe(false);
  });
});
