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
