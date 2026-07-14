import sys

file_path = "app/circle/workspace.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add state for Modal
if "const [showFullWhoHasPaid, setShowFullWhoHasPaid]" not in content:
    search_state = "  const [visibleActionCount, setVisibleActionCount] = useState(5);"
    if search_state in content:
        replace_state = "  const [showFullWhoHasPaid, setShowFullWhoHasPaid] = useState(false);\n" + search_state
        content = content.replace(search_state, replace_state)
    else:
        print("Error: Could not find visibleActionCount")
        sys.exit(1)

# 2. Fix the progress bar in the hero card
old_hero_grid = """        <View style={styles.heroGrid}>
          <InfoRow 
            label="Payout this round" 
            value={recipient ? `${memberName(recipient)} receives ${formatOptionalMoney(payoutAmount)}` : 'Unassigned'} 
          />
          <InfoRow
            label="Confirmed"
            value={formatConfirmedStatusFromCounts(
              visibleConfirmedCount,
              expectedContributionsCount,
            )}
          />
          <InfoRow label="Progress" value={formatProgress(visibleProgress)} last />
        </View>"""

new_hero_grid = """        <View style={styles.heroGrid}>
          <InfoRow 
            label="Payout this round" 
            value={recipient ? `${memberName(recipient)} receives ${formatOptionalMoney(payoutAmount)}` : 'Unassigned'} 
          />
          <InfoRow
            label="Confirmed"
            value={formatConfirmedStatusFromCounts(
              visibleConfirmedCount,
              expectedContributionsCount,
            )}
          />
          <InfoRow label="Progress" value={formatProgress(visibleProgress)} last />
        </View>
        <View style={{ height: 8, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 4, marginTop: 16, overflow: 'hidden', flexDirection: 'row' }}>
          <View style={{ height: '100%', backgroundColor: '#10B981', borderRadius: 4, width: typeof visibleProgress === 'number' ? `${Math.max(0, Math.min(100, visibleProgress))}%` : '0%' }} />
        </View>"""

if old_hero_grid in content and "height: 8, backgroundColor: 'rgba(0,0,0,0.05)'" not in content:
    content = content.replace(old_hero_grid, new_hero_grid)

# 3. Add Who Has Paid Card after Round details
old_round_details_end = """        <DetailRow
          label="Payout readiness"
          value={payoutReleased ? 'Released' : displayPayoutReady ? 'Ready' : 'Not ready'}
          last
        />
      </View>"""

new_who_has_paid_card = """      {/* Who Has Paid Card */}
      <View style={[styles.sectionCard, { paddingHorizontal: 0 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12 }}>
          <Text style={styles.sectionTitle}>Who has paid</Text>
          {currentRoundMembers.length > 5 && (
            <Pressable onPress={() => setShowFullWhoHasPaid(true)}>
              <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 14 }}>View all</Text>
            </Pressable>
          )}
        </View>
        <View>
          {[...currentRoundMembers].sort((a, b) => {
            const statusPriority = (raw: string) => {
              if (raw === 'confirmed') return 3;
              if (raw === 'submitted') return 2;
              return 1;
            };
            const prioA = statusPriority(a.status.raw);
            const prioB = statusPriority(b.status.raw);
            if (prioA !== prioB) return prioB - prioA;
            const timeA = new Date(a.contribution?.confirmedAt || a.contribution?.submittedAt || a.contribution?.updatedAt || 0).getTime();
            const timeB = new Date(b.contribution?.confirmedAt || b.contribution?.submittedAt || b.contribution?.updatedAt || 0).getTime();
            return timeB - timeA;
          }).slice(0, 5).map(({ member, status, contribution }, index, arr) => {
            const isLast = index === arr.length - 1;
            const dateStr = contribution?.confirmedAt || contribution?.submittedAt;
            const timeStr = dateStr ? new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
            return (
              <View key={member.id} style={[{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }, !isLast && { borderBottomWidth: 1, borderBottomColor: colors.cardBorder }]}>
                <Image source={{ uri: `https://ui-avatars.com/api/?name=${encodeURIComponent(memberName(member))}&background=random` }} style={{ width: 40, height: 40, borderRadius: 20, marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textStrong }}>{memberName(member)}</Text>
                  {timeStr ? <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>{timeStr}</Text> : null}
                </View>
                <View style={{ alignItems: 'flex-end', marginRight: 8 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textStrong }}>{formatMoney(circle.contributionAmount)}</Text>
                </View>
                <StatusBadge label={status.label === 'Overdue' || status.label === 'Due' ? 'Pending' : status.label} tone={renderBadgeTone(status.raw)} />
                {currentRoundMembers.length > 5 ? null : (
                  <FontAwesome name="angle-right" size={16} color={colors.muted} style={{ marginLeft: 8 }} />
                )}
              </View>
            );
          })}
        </View>
        {currentRoundMembers.length > 5 && (
          <Pressable onPress={() => setShowFullWhoHasPaid(true)} style={{ marginTop: 12, alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.cardBorder }}>
            <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 15 }}>View all {currentRoundMembers.length} members</Text>
          </Pressable>
        )}
      </View>"""

if old_round_details_end in content and "{/* Who Has Paid Card */}" not in content:
    content = content.replace(old_round_details_end, old_round_details_end + "\n\n" + new_who_has_paid_card)

# 4. Add the Modal at the end of RoundTab
old_end = """      ) : displayPayoutReady && !payoutReleased ? (
        <Text style={[styles.helperText, { marginTop: 8, textAlign: 'center', marginBottom: 24 }]}>
          The round appears fully confirmed. Waiting for backend payout permission.
        </Text>
      ) : null}
    </View>
  );
}"""

new_end = """      ) : displayPayoutReady && !payoutReleased ? (
        <Text style={[styles.helperText, { marginTop: 8, textAlign: 'center', marginBottom: 24 }]}>
          The round appears fully confirmed. Waiting for backend payout permission.
        </Text>
      ) : null}

      <Modal visible={showFullWhoHasPaid} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowFullWhoHasPaid(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.cardBorder, backgroundColor: '#fff' }}>
            <Pressable onPress={() => setShowFullWhoHasPaid(false)} style={{ padding: 8, marginRight: 16 }} accessibilityRole="button">
              <FontAwesome name="arrow-left" size={20} color={colors.textStrong} />
            </Pressable>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textStrong }}>Who has paid this round</Text>
          </View>
          <ScrollView style={{ flex: 1 }}>
            <View style={{ padding: 0, backgroundColor: '#fff', minHeight: '100%' }}>
              {[...currentRoundMembers].sort((a, b) => {
                const statusPriority = (raw: string) => {
                  if (raw === 'confirmed') return 3;
                  if (raw === 'submitted') return 2;
                  return 1;
                };
                const prioA = statusPriority(a.status.raw);
                const prioB = statusPriority(b.status.raw);
                if (prioA !== prioB) return prioB - prioA;
                const timeA = new Date(a.contribution?.confirmedAt || a.contribution?.submittedAt || a.contribution?.updatedAt || 0).getTime();
                const timeB = new Date(b.contribution?.confirmedAt || b.contribution?.submittedAt || b.contribution?.updatedAt || 0).getTime();
                return timeB - timeA;
              }).map(({ member, status, contribution }, index, arr) => {
                const isLast = index === arr.length - 1;
                const dateStr = contribution?.confirmedAt || contribution?.submittedAt;
                const timeStr = dateStr ? new Date(dateStr).toLocaleDateString() : '';
                return (
                  <View key={member.id} style={[{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }, !isLast && { borderBottomWidth: 1, borderBottomColor: colors.cardBorder }]}>
                    <Image source={{ uri: `https://ui-avatars.com/api/?name=${encodeURIComponent(memberName(member))}&background=random` }} style={{ width: 40, height: 40, borderRadius: 20, marginRight: 12 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textStrong }}>{memberName(member)}</Text>
                      {timeStr ? <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>{status.label === 'Confirmed' ? 'Confirmed' : 'Submitted'} {timeStr}</Text> : null}
                    </View>
                    <View style={{ alignItems: 'flex-end', marginRight: 8 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textStrong }}>{formatMoney(circle.contributionAmount)}</Text>
                    </View>
                    <StatusBadge label={status.label === 'Overdue' || status.label === 'Due' ? 'Pending' : status.label} tone={renderBadgeTone(status.raw)} />
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}"""

if old_end in content and "<Modal visible={showFullWhoHasPaid}" not in content:
    content = content.replace(old_end, new_end)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("workspace.tsx successfully updated.")
