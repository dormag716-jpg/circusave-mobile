import sys
import re

login_path = "app/login.tsx"
with open(login_path, "r", encoding="utf-8") as f:
    login_content = f.read()

# Add states
state_addition = """  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);"""
login_content = login_content.replace("  const [password, setPassword] = useState('');", state_addition)

# Clear confirm password
set_recovery_old = """    setPassword('');
  }"""
set_recovery_new = """    setPassword('');
    setConfirmPassword('');
  }"""
login_content = login_content.replace(set_recovery_old, set_recovery_new)

# Add validation
validation_old = """    if (recoveryMode && resetVerified && password.length < 8) {
      Alert.alert('Weak password', 'New password must be at least 8 characters.');
      return;
    }"""
validation_new = """    if (recoveryMode && resetVerified) {
      if (password.length < 8) {
        Alert.alert('Weak password', 'New password must be at least 8 characters.');
        return;
      }
      if (password !== confirmPassword) {
        Alert.alert('Mismatch', 'Passwords do not match.');
        return;
      }
    }"""
login_content = login_content.replace(validation_old, validation_new)

# Update normal password input
normal_pass_old = """                <TextInput
                  ref={passwordInputRef}
                  style={styles.input}
                  placeholder="Your password"
                  placeholderTextColor={colors.subtle}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="current-password"
                  returnKeyType="done"
                  onSubmitEditing={() => void handleSubmit()}
                />"""
normal_pass_new = """                <View style={[styles.input, { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 0 }]}>
                  <TextInput
                    ref={passwordInputRef}
                    style={{ flex: 1, color: colors.textStrong, fontSize: 16, paddingHorizontal: 16, minHeight: 56 }}
                    placeholder="Your password"
                    placeholderTextColor={colors.subtle}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoComplete="current-password"
                    returnKeyType="done"
                    onSubmitEditing={() => void handleSubmit()}
                  />
                  <Pressable
                    onPress={() => setShowPassword(!showPassword)}
                    style={{ padding: 16, justifyContent: 'center', alignItems: 'center' }}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                  >
                    <FontAwesome name={showPassword ? 'eye-slash' : 'eye'} size={20} color={colors.subtle} />
                  </Pressable>
                </View>"""
login_content = login_content.replace(normal_pass_old, normal_pass_new)

# Update reset password input and add confirm field
reset_pass_old = """                <TextInput
                  ref={passwordInputRef}
                  style={styles.input}
                  placeholder="8+ characters"
                  placeholderTextColor={colors.subtle}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="new-password"
                  returnKeyType="done"
                  onSubmitEditing={() => void handleSubmit()}
                />"""
reset_pass_new = """                <View style={[styles.input, { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 0 }]}>
                  <TextInput
                    ref={passwordInputRef}
                    style={{ flex: 1, color: colors.textStrong, fontSize: 16, paddingHorizontal: 16, minHeight: 56 }}
                    placeholder="8+ characters"
                    placeholderTextColor={colors.subtle}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoComplete="new-password"
                    returnKeyType="next"
                  />
                  <Pressable
                    onPress={() => setShowPassword(!showPassword)}
                    style={{ padding: 16, justifyContent: 'center', alignItems: 'center' }}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                  >
                    <FontAwesome name={showPassword ? 'eye-slash' : 'eye'} size={20} color={colors.subtle} />
                  </Pressable>
                </View>

                <Text style={styles.label}>Confirm new password</Text>
                <View style={[styles.input, { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 0 }]}>
                  <TextInput
                    style={{ flex: 1, color: colors.textStrong, fontSize: 16, paddingHorizontal: 16, minHeight: 56 }}
                    placeholder="Repeat password"
                    placeholderTextColor={colors.subtle}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showConfirmPassword}
                    autoComplete="new-password"
                    returnKeyType="done"
                    onSubmitEditing={() => void handleSubmit()}
                  />
                  <Pressable
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={{ padding: 16, justifyContent: 'center', alignItems: 'center' }}
                    accessibilityRole="button"
                    accessibilityLabel={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    <FontAwesome name={showConfirmPassword ? 'eye-slash' : 'eye'} size={20} color={colors.subtle} />
                  </Pressable>
                </View>"""
login_content = login_content.replace(reset_pass_old, reset_pass_new)

with open(login_path, "w", encoding="utf-8") as f:
    f.write(login_content)

print("login.tsx updated")

# Now update create-account.tsx
create_path = "app/create-account.tsx"
with open(create_path, "r", encoding="utf-8") as f:
    create_content = f.read()

create_state_add = """  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);"""
create_content = create_content.replace("  const [password, setPassword] = useState('');", create_state_add)

create_pass_old = """            <TextInput
              ref={passwordInputRef}
              style={styles.input}
              placeholder="At least 8 characters"
              placeholderTextColor={colors.subtle}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              returnKeyType="done"
              onSubmitEditing={() => void handleCreateAccount()}
            />"""
create_pass_new = """            <View style={[styles.input, { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 0 }]}>
              <TextInput
                ref={passwordInputRef}
                style={{ flex: 1, color: colors.textStrong, fontSize: 16, paddingHorizontal: 16, minHeight: 56 }}
                placeholder="At least 8 characters"
                placeholderTextColor={colors.subtle}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete="new-password"
                returnKeyType="done"
                onSubmitEditing={() => void handleCreateAccount()}
              />
              <Pressable
                onPress={() => setShowPassword(!showPassword)}
                style={{ padding: 16, justifyContent: 'center', alignItems: 'center' }}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? "Hide password" : "Show password"}
              >
                <FontAwesome name={showPassword ? 'eye-slash' : 'eye'} size={20} color={colors.subtle} />
              </Pressable>
            </View>"""
create_content = create_content.replace(create_pass_old, create_pass_new)

with open(create_path, "w", encoding="utf-8") as f:
    f.write(create_content)
print("create-account.tsx updated")
