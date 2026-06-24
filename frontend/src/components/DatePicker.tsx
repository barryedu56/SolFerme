import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, FlatList, SafeAreaView } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { MaterialIcons } from '@expo/vector-icons';

interface DatePickerProps {
  value: string; // Format AAAA-MM-JJ
  onChange: (date: string) => void;
  label?: string;
}

export const DatePicker: React.FC<DatePickerProps> = ({ value, onChange, label }) => {
  const { theme } = useTheme();
  const [showModal, setShowModal] = useState(false);

  // Parse current value or use today
  const currentDate = value ? new Date(value) : new Date();
  const [viewDate, setViewDate] = useState(new Date(currentDate));

  const months = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const generateDays = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const daysCount = daysInMonth(year, month);
    const firstDay = firstDayOfMonth(year, month);

    // Adjust for Monday start if needed, but standard getDay() is 0=Sun, 1=Mon...
    // We'll use 0 as Sunday.
    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(null); // Empty slots
    }
    for (let i = 1; i <= daysCount; i++) {
      days.push(i);
    }
    return days;
  };

  const handleSelectDay = (day: number | null) => {
    if (!day) return;
    const selected = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    const isoDate = selected.toISOString().split('T')[0];
    onChange(isoDate);
    setShowModal(false);
  };

  const changeMonth = (offset: number) => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + offset, 1));
  };

  const renderDay = ({ item }: { item: number | null }) => {
    const isToday = item &&
      new Date().getDate() === item &&
      new Date().getMonth() === viewDate.getMonth() &&
      new Date().getFullYear() === viewDate.getFullYear();

    const isSelected = item &&
      currentDate.getDate() === item &&
      currentDate.getMonth() === viewDate.getMonth() &&
      currentDate.getFullYear() === viewDate.getFullYear();

    return (
      <TouchableOpacity
        style={[
          styles.dayCell,
          isSelected ? { backgroundColor: theme.colors.primary } : null,
          !item ? styles.emptyCell : null
        ]}
        onPress={() => handleSelectDay(item)}
        disabled={!item}
      >
        <Text style={[
          styles.dayText,
          { color: theme.colors.text },
          isSelected ? { fontWeight: 'bold', color: '#000' } : null,
          (isToday && !isSelected) ? { color: theme.colors.primary, fontWeight: 'bold', textDecorationLine: 'underline' } : null
        ]}>
          {item}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {label && <Text style={[styles.label, { color: theme.colors.textSecondary }]}>{label}</Text>}

      <TouchableOpacity
        style={[styles.trigger, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
        onPress={() => {
          setViewDate(new Date(currentDate));
          setShowModal(true);
        }}
      >
        <Text style={[styles.valueText, { color: theme.colors.text }]}>
          {value || 'Choisir une date'}
        </Text>
        <MaterialIcons name="calendar-today" size={20} color={theme.colors.primary} />
      </TouchableOpacity>

      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => changeMonth(-1)}>
                <MaterialIcons name="chevron-left" size={32} color={theme.colors.primary} />
              </TouchableOpacity>

              <View style={styles.headerDate}>
                <Text style={[styles.monthText, { color: theme.colors.text }]}>
                  {months[viewDate.getMonth()]}
                </Text>
                <Text style={[styles.yearText, { color: theme.colors.textSecondary }]}>
                  {viewDate.getFullYear()}
                </Text>
              </View>

              <TouchableOpacity onPress={() => changeMonth(1)}>
                <MaterialIcons name="chevron-right" size={32} color={theme.colors.primary} />
              </TouchableOpacity>
            </View>

            <View style={styles.weekDays}>
              {['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'].map(d => (
                <Text key={d} style={[styles.weekDayText, { color: theme.colors.textSecondary }]}>{d}</Text>
              ))}
            </View>

            <FlatList
              data={generateDays()}
              renderItem={renderDay}
              keyExtractor={(item, index) => index.toString()}
              numColumns={7}
              scrollEnabled={false}
              contentContainerStyle={styles.daysGrid}
            />

            <TouchableOpacity
              style={[styles.closeButton, { backgroundColor: theme.colors.background }]}
              onPress={() => setShowModal(false)}
            >
              <Text style={{ color: theme.colors.text, fontWeight: 'bold' }}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 8, marginLeft: 4 },
  trigger: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  valueText: { fontSize: 16 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    borderRadius: 20,
    padding: 16,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerDate: { alignItems: 'center' },
  monthText: { fontSize: 20, fontWeight: 'bold' },
  yearText: { fontSize: 14 },
  weekDays: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
  },
  weekDayText: { fontSize: 12, width: 40, textAlign: 'center', fontWeight: 'bold' },
  daysGrid: { paddingBottom: 10 },
  dayCell: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 2,
    borderRadius: 20,
  },
  emptyCell: { backgroundColor: 'transparent' },
  dayText: { fontSize: 14 },
  closeButton: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  }
});
