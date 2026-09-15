import { theme } from "@/lib/theme";
import { View, FlatList, ActivityIndicator, Pressable, Dimensions } from "react-native";
import { Text } from "@/components/Typography";
import { useAuth } from "@/lib/useAuth";
import { useAllWorkouts, type AllWorkoutsRow } from "@/lib/workout";
import { ErrorState } from "@/components/ErrorState";
import { router, Stack } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { formatDateKey } from "@/lib/date";

const { width } = Dimensions.get("window");
const COLUMN_WIDTH = (width - 48) / 2; // 16px padding on sides + 16px gap = 48

function WorkoutCard({ workout }: { workout: AllWorkoutsRow }) {
  // Notu veya hareketleri düz metin formunda (not defteri gibi) gösterelim.
  // Kullanıcının attığı SS'te "Smith machine incline press \n 1. 50 kilo 8 tekrar..." şeklinde görünüyor.
  
  return (
    <View style={{ width: COLUMN_WIDTH, marginBottom: 24 }}>
      <Pressable
        onPress={() => router.push(`/entry/${workout.id}`)}
        className="bg-surface border border-border rounded-xl p-3 mb-2 h-[160px] overflow-hidden"
      >
        {workout.note ? (
          <Text 
            className="text-text text-sm mb-3 leading-relaxed"
            numberOfLines={workout.items && workout.items.length > 0 ? 2 : 6}
          >
            {workout.note}
          </Text>
        ) : null}

        {workout.items && workout.items.length > 0 ? (
          <View>
            {workout.items.map((item, idx) => (
              <View key={idx} className="mb-3 last:mb-0">
                <Text className="text-text font-medium text-sm mb-1">{item.name}</Text>
                {item.sets.map((set, sIdx) => {
                  // Not defterindeki gibi: "1. 50 kilo 8 tekrar"
                  let setStr = `${sIdx + 1}. `;
                  if (set.weight) setStr += `${set.weight} kilo `;
                  if (set.reps) setStr += `${set.reps} tekrar`;
                  if (!set.weight && !set.reps) setStr += "-";
                  
                  return (
                    <Text key={sIdx} className="text-textMuted text-xs ml-1 mb-0.5">
                      {setStr.trim()}
                    </Text>
                  );
                })}
              </View>
            ))}
          </View>
        ) : null}
      </Pressable>
      
      {/* Kartın altında dosya adı gibi görünen tarih (SS'teki "Metin notu 15/08" gibi) */}
      <View className="items-center">
        <Text className="text-text font-medium text-sm">
          Antrenman {formatDateKey(workout.date, { day: "2-digit", month: "2-digit" })}
        </Text>
        <Text className="text-textFaint text-xs mt-0.5">
          {formatDateKey(workout.date, { day: "numeric", month: "short" })}
        </Text>
      </View>
    </View>
  );
}

// Ay bazlı gruplama ve 2 kolonlu yapı için FlatList verisini hazırlıyoruz.
type ListItem = 
  | { type: 'header'; id: string; title: string }
  | { type: 'row'; id: string; workouts: AllWorkoutsRow[] };

function prepareData(workouts: AllWorkoutsRow[]): ListItem[] {
  const groups: Record<string, AllWorkoutsRow[]> = {};
  
  // Önce aylara göre grupla
  workouts.forEach(w => {
    const month = formatDateKey(w.date, { month: "long", year: "numeric" });
    if (!groups[month]) groups[month] = [];
    groups[month].push(w);
  });

  const result: ListItem[] = [];
  
  // Grupları dolaş ve 2'li satırlara böl
  Object.entries(groups).forEach(([month, items]) => {
    result.push({ type: 'header', id: `header-${month}`, title: month });
    
    for (let i = 0; i < items.length; i += 2) {
      result.push({
        type: 'row',
        id: `row-${month}-${i}`,
        workouts: items.slice(i, i + 2)
      });
    }
  });
  
  return result;
}

export default function WorkoutsScreen() {
  const { user } = useAuth();
  const { data: workouts, isLoading, error, refetch } = useAllWorkouts(user?.id);

  const listData = workouts ? prepareData(workouts) : [];

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen 
        options={{ 
          title: "Notlar", 
          headerShown: true,
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.text,
          headerShadowVisible: false,
          headerBackTitle: "Geri"
        }} 
      />

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={theme.colors.accent} size="large" />
        </View>
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          renderItem={({ item }) => {
            if (item.type === 'header') {
              return (
                <Text className="text-text font-bold text-lg mt-4 mb-4 capitalize">
                  {item.title}
                </Text>
              );
            }
            
            return (
              <View className="flex-row justify-between w-full">
                {item.workouts.map(w => (
                  <WorkoutCard key={w.id} workout={w} />
                ))}
                {/* Eğer tek bir kart kaldıysa, 2. kolon boş kalıp yerleşimi bozmasın diye görünmez bir view ekliyoruz */}
                {item.workouts.length === 1 && (
                  <View style={{ width: COLUMN_WIDTH }} />
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <View className="items-center justify-center py-10 px-4">
              <View className="w-16 h-16 rounded-full bg-surface border border-border items-center justify-center mb-4">
                <Feather name="edit-2" size={24} color={theme.colors.textFaint} />
              </View>
              <Text className="text-text text-lg font-semibold text-center mb-2">
                Henüz kayıtlı antrenmanın yok
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}
