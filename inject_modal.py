import sys

file_path = "app/circle/workspace.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Fix Modal injection at the end of RoundTab
old_end = """      ) : displayPayoutReady && !payoutReleased ? (
        <Text style={[styles.helperText, { marginTop: 8, textAlign: 'center' }]}>
          The round appears fully confirmed. Waiting for backend payout permission.
        </Text>
      ) : null}
    </View>
  );
}"""

new_end = """      ) : displayPayoutReady && !payoutReleased ? (
        <Text style={[styles.helperText, { marginTop: 8, textAlign: 'center' }]}>
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
else:
    print("Failed to replace old_end")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Modal injection updated.")
